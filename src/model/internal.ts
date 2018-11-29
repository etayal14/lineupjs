import {LazyBoxPlotData} from '../internal';
import {IOrderedGroup} from './Group';
import {IDataRow, IGroup, IGroupParent} from './interfaces';
import INumberColumn, {numberCompare} from './INumberColumn';
import {schemeCategory10, schemeSet3} from 'd3-scale-chromatic';


/** @internal */
export function patternFunction(pattern: string, ...args: string[]) {
  return new Function('value', ...args, `
  const escapedValue = encodeURIComponent(String(value));
  return \`${pattern}\`;
 `);
}


/** @internal */
export function joinGroups(groups: IGroup[]): IGroup {
  console.assert(groups.length > 0);
  if (groups.length === 1) {
    return groups[0];
  }
  // create a chain
  const parents: IGroupParent[] = groups.map((g) => Object.assign({subGroups: []}, g));
  parents.slice(1).forEach((g, i) => {
    g.parent = parents[i];
    parents[i].subGroups.push(g);
  });
  const g = {
    name: parents.map((d) => d.name).join(' ∩ '),
    color: parents[0].color,
    parent: parents[parents.length - 1]
  };
  g.parent.subGroups.push(g);
  return g;
}

/** @internal */
export function toGroupID(group: IGroup) {
  return group.name;
}

/** @internal */
export function unifyParents<T extends IOrderedGroup>(groups: T[]) {
  if (groups.length <= 1) {
    return;
  }
  const lookup = new Map<string, IGroupParent>();

  const resolve = (g: IGroupParent): { g: IGroupParent, id: string } => {
    let id = g.name;
    if (g.parent) {
      const parent = resolve(g.parent);
      g.parent = parent.g;
      id = `${parent.id}.$[id}`;
    }
    // ensure there is only one instance per id (i.e. share common parents
    if (lookup.has(id)) {
      return {g: lookup.get(id)!, id};
    }
    if (g.parent) {
      g.parent.subGroups.push(g);
    }
    g.subGroups = []; // clear old children
    lookup.set(id, g);
    return {g, id};
  };
  // resolve just parents
  groups.forEach((g) => {
    if (g.parent) {
      g.parent = resolve(g.parent).g;
      g.parent.subGroups.push(g);
    }
  });
}

// based on https://github.com/d3/d3-scale-chromatic#d3-scale-chromatic
const colors = schemeCategory10.concat(schemeSet3);

/** @internal */
export const MAX_COLORS = colors.length;

/** @internal */
export function colorPool() {
  let act = 0;
  return () => colors[(act++) % colors.length];
}


/** @internal */
export function medianIndex(rows: IDataRow[], col: INumberColumn): number {
  //return the median row
  const data = rows.map((r, i) => ({i, v: col.getNumber(r), m: col.isMissing(r)}));
  const sorted = data.filter((r) => !r.m).sort((a, b) => numberCompare(a.v, b.v));
  const index = sorted[Math.floor(sorted.length / 2.0)];
  if (index === undefined) {
    return 0; //error case
  }
  return index.i;
}

/** @internal */
export function groupCompare(a: IDataRow[], b: IDataRow[], col: INumberColumn, sortMethod: keyof LazyBoxPlotData) {
  const va = new LazyBoxPlotData(a.map((row) => col.getNumber(row)));
  const vb = new LazyBoxPlotData(b.map((row) => col.getNumber(row)));

  return numberCompare(<number>va[sortMethod], <number>vb[sortMethod]);
}


