/**
 * Created by Samuel Gratzl on 14.08.2015.
 */

import Column from '../model/Column';
import CategoricalNumberColumn from '../model/CategoricalNumberColumn';
import CompositeNumberColumn from '../model/CompositeNumberColumn';

import ICellRendererFactory from './ICellRendererFactory';
import BarCellRenderer from './BarCellRenderer';
import {DefaultCellRenderer} from './DefaultCellRenderer';
import StringCellRenderer from './StringCellRenderer';
import SelectionRenderer from './SelectionRenderer';
import LinkCellRenderer from './LinkCellRenderer';
import AnnotationRenderer from './AnnotationRenderer';
import ActionRenderer from './ActionRenderer';
import StackCellRenderer from './StackCellRenderer';
import CategoricalCellRenderer from './CategoricalCellRenderer';
import NumbersCellRenderer from './NumbersCellRenderer';
import SparklineCellRenderer from './SparklineCellRenderer';
import VerticalBarCellRenderer from './VerticalBarCellRenderer';
import UpSetCellRenderer from './UpSetCellRenderer';
import CircleCellRenderer from './CircleCellRenderer';
import BoxplotCellRenderer from './BoxplotCellRenderer';
import LoadingCellRenderer from './LoadingCellRenderer';
import ThresholdCellRenderer from './ThresholdCellRenderer';
import HeatmapCellRenderer from './HeatmapCellRenderer';
import {IDOMRenderContext, ICanvasRenderContext} from './RendererContexts';
import {EmptyCellRenderer} from './EmptyCellRenderer';
import CategoricalColorCellRenderer from './CategoricalColorCellRenderer';


export const defaultCellRenderer = new DefaultCellRenderer();
const combineCellRenderer = new BarCellRenderer(false, (d, i, col: CompositeNumberColumn) => col.getColor(d, i));

/**
 * default render factories
 */
export const renderers: { [key: string]: ICellRendererFactory } = {
  rank: new DefaultCellRenderer('rank', 'right'),
  boolean: new DefaultCellRenderer('boolean', 'center'),
  number: new BarCellRenderer(),
  ordinal: new BarCellRenderer(true, (d, i, col: CategoricalNumberColumn) => col.getColor(d, i)),
  string: new StringCellRenderer(),
  selection: new SelectionRenderer(),
  heatmap: new HeatmapCellRenderer(),
  link: new LinkCellRenderer(),
  annotate: new AnnotationRenderer(),
  actions: new ActionRenderer(),
  stack: new StackCellRenderer(),
  nested: new StackCellRenderer(false),
  categorical: new CategoricalCellRenderer(),
  catcolor: new CategoricalColorCellRenderer(),
  max: combineCellRenderer,
  min: combineCellRenderer,
  mean: combineCellRenderer,
  script: combineCellRenderer,
  numbers: new NumbersCellRenderer(),
  threshold: new ThresholdCellRenderer(),
  sparkline: new SparklineCellRenderer(),
  verticalbar: new VerticalBarCellRenderer(),
  set: new UpSetCellRenderer(),
  upset: new UpSetCellRenderer(),
  circle: new CircleCellRenderer(),
  boxplot: new BoxplotCellRenderer(),
  loading: new LoadingCellRenderer(),
  empty: new EmptyCellRenderer()
};

function chooseRenderer(col: Column, renderers: { [key: string]: ICellRendererFactory }): ICellRendererFactory {
  const r = renderers[col.getRendererType()];
  return r || defaultCellRenderer;
}

export function createDOM(col: Column, renderers: { [key: string]: ICellRendererFactory }, context: IDOMRenderContext) {
  const r = chooseRenderer(col, renderers);
  return (r.createDOM ? r.createDOM.bind(r) : defaultCellRenderer.createDOM.bind(r))(col, context);
}

export function createCanvas(col: Column, renderers: { [key: string]: ICellRendererFactory }, context: ICanvasRenderContext) {
  const r = chooseRenderer(col, renderers);
  return (r.createCanvas ? r.createCanvas.bind(r) : defaultCellRenderer.createCanvas.bind(r))(col, context);
}
