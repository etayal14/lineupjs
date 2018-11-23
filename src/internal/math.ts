import {histogram, quantile} from 'd3-array';
import {ICategory, isMissingValue} from '../model';
import {IMappingFunction} from '../model/MappingFunction';

export interface INumberBin {
  x0: number;
  x1: number;
  length: number;
}

export interface IBoxPlotData {
  readonly min: number;
  readonly max: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
  readonly outlier?: number[];
  readonly whiskerLow?: number;
  readonly whiskerHigh?: number;
}

export interface IAdvancedBoxPlotData extends IBoxPlotData {
  readonly mean: number;
}

export interface IStatistics extends IAdvancedBoxPlotData {
  readonly count: number;
  readonly maxBin: number;
  readonly hist: INumberBin[];
  readonly missing: number;
}

export interface ICategoricalBin {
  cat: string;
  y: number;
}

export interface ICategoricalStatistics {
  readonly maxBin: number;
  readonly hist: ICategoricalBin[];
  readonly missing: number;
}

/**
 * @internal
 * @param {number} length
 * @returns {number}
 */
export function getNumberOfBins(length: number) {
  // as by default used in d3 the Sturges' formula
  return Math.ceil(Math.log(length) / Math.LN2) + 1;
}


/**
 * helper class to lazily compute box plotdata out of a given number array
 * @internal
 */
export class LazyBoxPlotData implements IStatistics {
  private readonly values: Float32Array;

  readonly missing: number;

  readonly max: number;
  readonly min: number;
  readonly sum: number;
  readonly mean: number;

  private readonly histGen: (data: number[]) => INumberBin[];

  constructor(values: number[], histGen?: (data: number[]) => INumberBin[]) {
    // filter out NaN
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    this.values = Float32Array.from(values.filter((v) => {
      if (isMissingValue(v)) {
        return false;
      }
      min = Math.min(min, v);
      max = Math.min(max, v);
      sum += v;
      return true;
    }));
    this.missing = values.length - this.values.length;

    if (this.values.length === 0) {
      this.max = this.min = this.mean = NaN;
      this.sum = 0;
    } else {
      this.max = max;
      this.min = min;
      this.sum = sum;
      this.mean = sum / this.values.length;
    }

    if (histGen) {
      this.histGen = histGen;
      return;
    }
    const hist = histogram();
    hist.thresholds(getNumberOfBins(values.length));
    this.histGen = <any>hist;
  }

  get count() {
    return this.values.length + this.missing;
  }

  /**
   * lazy compute sorted array
   * @returns {number[]}
   */
  @cached()
  private get sorted() {
    return this.values.sort();
  }

  @cached()
  get hist() {
    if (!this.histGen) {
      return [];
    }
    return this.histGen(Array.from(this.values));
  }

  @cached()
  get maxBin() {
    return this.hist.reduce((a, b) => Math.max(a, b.length), 0);
  }

  @cached()
  get median() {
    return quantile(this.sorted, 0.5)!;
  }

  @cached()
  get q1() {
    return quantile(this.sorted, 0.25)!;
  }

  @cached()
  get q3() {
    return quantile(this.sorted, 0.75)!;
  }

  @cached()
  get whiskerLow() {
    const q1 = this.q1;
    const q3 = this.q3;
    const iqr = q3 - q1;
    const left = q1 - 1.5 * iqr;
    // look for the closests value which is bigger than the computed left
    const whiskerLow = this.sorted.find((v) => left < v);
    return whiskerLow == null ? left : whiskerLow;
  }

  @cached()
  get whiskerHigh() {
    const q1 = this.q1;
    const q3 = this.q3;
    const iqr = q3 - q1;
    const right = q3 + 1.5 * iqr;
    // look for the closests value which is smaller than the computed right
    const s = this.sorted;
    for (let i = s.length - 1; i >= 0; --i) {
      if (s[i] < right) {
        return s[i];
      }
    }
    return right;
  }

  @cached()
  get outlier() {
    const left = this.whiskerLow;
    const right = this.whiskerHigh;
    return Array.from(this.sorted.filter((v) => (v < left || v > right)));
  }
}

/**
 * cache the value in a hidden __ variable
 * @internal
 */
function cached() {
  return function (_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const getter = descriptor.get!;
    const cacheKey = `__${propertyKey}`;
    descriptor.get = function (this: any) {
      if (this.hasOwnProperty(cacheKey)) {
        return this[cacheKey];
      }
      const value = getter.call(this);
      this[cacheKey] = value;
      return value;
    };
    return descriptor;
  };
}


/**
 * computes the simple statistics of an array using d3 histogram
 * @param arr the data array
 * @param acc accessor function
 * @param range the total value range
 * @param bins the number of bins
 * @returns {{min: number, max: number, count: number, hist: histogram.Bin<number>[]}}
 * @internal
 */
export function computeStats(arr: number[], range?: [number, number], bins?: number): IStatistics {
  if (arr.length === 0) {
    return {
      min: NaN,
      max: NaN,
      mean: NaN,
      q1: NaN,
      q3: NaN,
      outlier: [],
      median: NaN,
      count: 0,
      maxBin: 0,
      hist: [],
      missing: 0
    };
  }

  const hist = histogram();
  if (range) {
    hist.domain(range);
  }
  if (bins) {
    hist.thresholds(bins);
  } else {
    hist.thresholds(getNumberOfBins(arr.length));
  }

  return new LazyBoxPlotData(arr, <(data: number[]) => INumberBin[]>hist);
}


/**
 * computes a categorical histogram
 * @param arr the data array
 * @param acc the accessor
 * @param categories the list of known categories
 * @returns {{hist: {cat: string, y: number}[]}}
 * @internal
 */
export function computeHist<T>(arr: T[], acc: (row: T) => ICategory | null, categories: ICategory[]): ICategoricalStatistics {
  const m = new Map<string, number>();
  let missingCount = 0;
  categories.forEach((cat) => m.set(cat.name, 0));

  for (const a of arr) {
    const v = acc(a);
    if (v == null) {
      missingCount += 1;
      continue;
    }
    m.set(v.name, (m.get(v.name) || 0) + 1);
  }
  const entries: { cat: string; y: number }[] = categories.map((d) => ({cat: d.name, y: m.get(d.name)!}));
  return {
    maxBin: entries.reduce((a, b) => Math.max(a, b.y), Number.NEGATIVE_INFINITY),
    hist: entries,
    missing: missingCount
  };
}

/**
 * round to the given commas similar to d3.round
 * @param {number} v
 * @param {number} precision
 * @returns {number}
 * @internal
 */
export function round(v: number, precision: number = 0) {
  if (precision === 0) {
    return Math.round(v);
  }
  const scale = Math.pow(10, precision);
  return Math.round(v * scale) / scale;
}

/**
 * compares two number whether they are similar up to delta
 * @param {number} a first numbre
 * @param {number} b second number
 * @param {number} delta
 * @returns {boolean} a and b are similar
 * @internal
 */
export function similar(a: number, b: number, delta = 0.5) {
  if (a === b) {
    return true;
  }
  return Math.abs(a - b) < delta;
}
