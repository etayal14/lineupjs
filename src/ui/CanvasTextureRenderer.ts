import EngineRanking from './EngineRanking';
import {IDataRow} from '../model';
import {scaleLinear, scaleOrdinal} from 'd3-scale';
import Column from '../model/Column';
import NumberColumn from '../model/NumberColumn';
import NumbersColumn from '../model/NumbersColumn';
import CategoricalColumn from '../model/CategoricalColumn';
import CategoricalsColumn from '../model/CategoricalsColumn';
import CompositeColumn from '../model/CompositeColumn';
import * as d3 from 'd3-selection';
import * as drag from 'd3-drag';
import {ILineUpOptions} from '../interfaces';
import EngineRenderer from './EngineRenderer';
import {MultiTableRowRenderer} from 'lineupengine';
import SelectionColumn from '../model/SelectionColumn';
import OverviewDetailColumn from '../model/OverviewDetailColumn';
import Ranking from '../model/Ranking';

export interface ITextureRenderer {
  update(rankings?: EngineRanking[], localData?: IDataRow[][]): void;
  expandTextureRenderer(use: boolean): void;
  destroy(): void;
  show(): void;
  hide(): void;
  updateSelection(dataIndices: number[]): void;
  addRanking(ranking: EngineRanking): void;
  removeRanking(ranking: Ranking | null): void;
  s2d(): void;
  d2s(): void;
}

export default class CanvasTextureRenderer implements ITextureRenderer {

  readonly node: HTMLElement;
  readonly canvas: any;
  readonly headerNode: HTMLElement;
  private renderedColumns: any[];
  private dragStartPosition: [number, number] = [0,0];
  private dragOverlay: HTMLElement;
  private detailParts: any[];
  private currentRankings: EngineRanking[] = [];
  private currentLocalData: IDataRow[][] = [];
  private currentNodeHeight: number = 0;
  private currentRankingWidths: number[] = [];
  private engineRenderer: EngineRenderer;
  private engineRankings: EngineRanking[][] = [];
  private skipUpdateEvents: number = 0;
  private alreadyExpanded: boolean = false;
  private expandLaterRows: any[] = [];
  private readonly options: Readonly<ILineUpOptions>;
  private readonly idPrefix = 'testprefix';

  constructor(parent: Element, engineRenderer: EngineRenderer, options: Readonly<ILineUpOptions>) {
    this.node = parent.ownerDocument.createElement('main');
    this.node.id = 'lu-texture-container';
    parent.appendChild(this.node);
    this.canvas = parent.ownerDocument.createElement('canvas');
    this.headerNode = <HTMLElement>d3.select(parent).select('header').node();
    this.engineRenderer = engineRenderer;
    this.options = options;
    this.renderedColumns = [];
    this.detailParts = [];
    this.dragOverlay = this.node;

    this.node.addEventListener('scroll', () => {
      {
        //scroll header with main panel
        this.headerNode.scrollLeft = this.node.scrollLeft;
      }
    });
  }

  updateSelection(dataIndices: number[]) {
    const s = new Set(dataIndices);
    this.engineRankings.forEach((v) => v.forEach((r) => r.updateSelection(s)));
    this.drawSelection();
    this.update();
  }

  update(rankings: EngineRanking[] = this.currentRankings, localData: IDataRow[][] = this.currentLocalData) {
    this.detailParts = [];
    this.currentLocalData = localData;
    this.currentNodeHeight = this.node.offsetHeight;
    let totalWidth = 0;
    rankings.forEach((r, i) => {
      let rankingWidth = 0;
      r.ranking.flatColumns.forEach((c) => 'children' in c ? rankingWidth += (<CompositeColumn>c).children.length : rankingWidth += c.getWidth() + 5);
      this.currentRankingWidths[i] = rankingWidth;
      totalWidth += rankingWidth;
    });
    if (totalWidth > this.node.clientWidth) {
        this.currentNodeHeight -= 20;
    }
    this.alreadyExpanded = this.node.classList.contains('expand');

    this.renderColumns(rankings, localData);
  }

  private renderColumns (rankings: EngineRanking[], localData: IDataRow[][]) {
    rankings.forEach((r, i) => {
      let gIndex = 0;
      const aggregatedParts = <any>[];
      r.ranking.getGroups().forEach((g) => {
        if (this.engineRenderer.ctx.provider.isAggregated(r.ranking, g)) {
          aggregatedParts.push([gIndex, gIndex + g.order.length - 1]);
        }
        gIndex += g.order.length;
      });

      const rankingIndex = this.currentRankings.findIndex((v) => v === r);
      this.engineRankings[rankingIndex] = [];
      //TODO: combine
      this.detailParts = [];
      let startIndex = -1;
      for (let j = 0; j < localData[i].length; j++) {
        if (this.engineRenderer.ctx.provider.isDetail(localData[i][j].i)) {
          if (startIndex === -1) {
            startIndex = j;
          }
        } else if (startIndex !== -1) {
          this.detailParts.push([startIndex, j-1]);
          startIndex = -1;
        }
      }
      if (startIndex !== -1) {
        this.detailParts.push([startIndex, localData[i].length-1]);
      }

      const aggregateIndices = <any>[];
      aggregatedParts.forEach((g: any) => {
        for (let j = 0; j < this.detailParts.length; j++) {
          if (g[0] <= this.detailParts[j][0]) {
            if (g[1] <= this.detailParts[j][0]) {
              this.detailParts.splice(j, 0, g);
              aggregateIndices.push(j);
              return;
            } else {
              if (g[1] < this.detailParts[j][1]) {
                this.detailParts.splice(j, 1, g, [g[1] + 1, this.detailParts[j][1]]);
                aggregateIndices.push(j);
                return;
              } else {
                this.detailParts.splice(j, 1);
              }
            }
          } else {
            if (g[0] <= this.detailParts[j][1]) {
              if (g[1] < this.detailParts[j][1]) {
                this.detailParts.splice(j, 1, [this.detailParts[j][0], g[0] - 1], g, [g[1] + 1, this.detailParts[j][1]]);
                aggregateIndices.push(j + 1);
                return;
              } else {
                this.detailParts.splice(j, 1, [this.detailParts[j][0], g[0] - 1]);
              }
            }
          }
        }
        this.detailParts.push(g);
        aggregateIndices.push(this.detailParts.length - 1);
      });

      const dataParts = <any>[];
      const expandableParts = <any>[];
      const aggregateParts = <any>[];
      if(this.detailParts.length === 0) {
        dataParts.push(localData[i].length);
      } else {
        let next = 0;
        this.detailParts.forEach((v, j) => {
          const curFrom = v[0];
          const curTo = v[1];
          if (curFrom > next) {
            dataParts.push(curFrom);
          }
          expandableParts.push(dataParts.length);
          if (aggregateIndices.includes(j)) {
            aggregateParts.push(dataParts.length);
          }
          dataParts.push(curTo + 1);
          next = curTo + 1;
        });
        if (next < localData[i].length) {
          dataParts.push(localData[i].length);
        }
      }
//
      let curIndex = 0;
      const rankingDiv = <any>d3.select(this.node).select(`[data-ranking="${rankingIndex}"]`)!.node();
      if (!rankingDiv) {
        return;
      }
      rankingDiv.innerHTML = ''; //remove all children
      const grouped = r.groupData(localData[i]);
      let aggregateOffset = 0;
      dataParts.forEach((v: number, di: number) => {
        const expandable = expandableParts.includes(di);
        const aggregated = aggregateParts.includes(di);
        let newOffset = 0;
        if (aggregated) {
          newOffset = v - curIndex - 1;
        }
        const data = grouped.slice(curIndex - aggregateOffset, v - aggregateOffset - newOffset);

        const rowDiv = this.node.ownerDocument.createElement('div');
        rowDiv.setAttribute('data-from', `${curIndex}`);
        rowDiv.setAttribute('data-to', `${v-1}`);
        rowDiv.classList.add('rowContainer');
        rankingDiv.appendChild(rowDiv);

        curIndex = v;
        aggregateOffset += newOffset;

        if (!aggregated) {
          const textureDiv = this.node.ownerDocument.createElement('div');
          textureDiv.style.height = `${data.length / localData[i].length * this.currentNodeHeight}px`;
          textureDiv.classList.add('textureContainer');
          if (!expandable) {
            textureDiv.classList.add('always');
          }
          this.renderedColumns = [];
          r.ranking.flatColumns.forEach((column) => this.createColumn(column, data, textureDiv, false, expandable));
          rowDiv.appendChild(textureDiv);
        }
        if (expandable) {
          const expandLater = () => {
            const engineRendererDiv = this.node.ownerDocument.createElement('article');
            //const id = `renderRow_${di}`;
            engineRendererDiv.classList.add('engineRendererContainer');
            if (aggregated) {
              engineRendererDiv.classList.add('always');
            }
            if (aggregated) {
              engineRendererDiv.style.height = `${45}px`;
            } else {
              engineRendererDiv.style.height = `${(this.options.rowHeight + this.options.rowPadding) * data.length + 10}px`;
            }
            engineRendererDiv.style.width = `${this.currentRankingWidths[i]}px`;

            rowDiv.appendChild(engineRendererDiv);

            const table = new MultiTableRowRenderer(engineRendererDiv, `#${this.idPrefix}`);
            const engineRanking = table.pushTable((header, body, tableId, style) => new EngineRanking(r.ranking, header, body, tableId, style, this.engineRenderer.ctx, {
              animation: this.options.animated,
              customRowUpdate: this.options.customRowUpdate || (() => undefined),
              levelOfDetail: this.options.levelOfDetail || (() => 'high'),
              flags: this.options.flags
            }));

            this.engineRenderer.render(engineRanking, <any>data);
            this.engineRankings[rankingIndex].push(engineRanking);
            engineRanking.on(EngineRanking.EVENT_UPDATE_DATA, () => this.handleUpdateEvent(r));
            this.skipUpdateEvents++;
          };
          if (this.alreadyExpanded || aggregated) {
            expandLater();
          } else {
            this.expandLaterRows.push(expandLater);
          }
        }

        if (expandable) {
          return;
        }
        const that = this;
        d3.select(rowDiv)
          .call(<any>drag.drag()
            .on('start', (_, __, element) => { that.dragStarted(element[0]); })
            .on('drag', (_ , __, element) => { that.dragged(element[0]); })
            .on('end', (_, __, element) => { that.dragEnd(element[0]); }));
      });
    });
    this.drawSelection();
  }

  private createColumn(column: Column, grouped: any[], container: HTMLElement, partOfComposite: boolean, expandable: boolean) {
    if (this.renderedColumns.includes(column.id)) {
      if (partOfComposite) {
        const $container = d3.select(container);
        const $col = $container.select(`.columnContainer[data-columnid="${column.id}"]`).node();
        if ($col !== null) {
          $container.append(() => $col); //reorder the column
          return;
        }
      } else {
        return; //column already rendered
      }
    }

    const columnContainer = this.node.ownerDocument.createElement('div');
    columnContainer.style.width = `${column.getWidth()}px`;
    columnContainer.setAttribute('data-columnid', column.id);
    columnContainer.classList.add('columnContainer');
    if (partOfComposite) {
      columnContainer.classList.add('partOfComposite');
    }

    let newElement = <any>null;
    if (column instanceof NumbersColumn) {
      const col = <NumbersColumn>column;
      newElement = this.generateImage(grouped.map((value) => {
        return (<any>value).v[(<any>col.desc).column];
      }), CanvasTextureRenderer.getColorScale(col));
    } else if (column instanceof NumberColumn) {
      const col = <NumberColumn>column;
      newElement = this.generateImage(grouped.map((value) => {
        return [(<any>value).v[(<any>col.desc).column]];
      }), CanvasTextureRenderer.getColorScale(col));
    } else if (column instanceof CategoricalsColumn) {
      const col = <CategoricalsColumn>column;
      newElement = this.generateImage(grouped.map((value) => {
        return (<any>value).v[(<any>col.desc).column];
      }), CanvasTextureRenderer.getColorScale(col));
    } else if (column instanceof CategoricalColumn) {
      const col = <CategoricalColumn>column;
      newElement = this.generateImage(grouped.map((value) => {
        return [(<any>value).v[(<any>col.desc).column]];
      }), CanvasTextureRenderer.getColorScale(col));
    } else if (column instanceof SelectionColumn) {
      const col = <SelectionColumn>column;
      newElement = this.generateImage(grouped.map((value) => {
        return [this.engineRenderer.ctx.provider.isSelected((<any>value).i)];
      }), CanvasTextureRenderer.getColorScale(col));
    } else if (column instanceof OverviewDetailColumn) {
      const col = <OverviewDetailColumn>column;
      newElement = this.generateImage(grouped.map((value) => {
        return [this.engineRenderer.ctx.provider.isDetail((<any>value).i)];
      }), CanvasTextureRenderer.getColorScale(col));
    } else if ('children' in column) {
      //handle composite columns
      (<CompositeColumn>column).children.forEach((c) => this.createColumn(c, grouped, container, true, expandable));
      return;
    } else {
      newElement = this.node.ownerDocument.createElement('canvas');
    }

    columnContainer.appendChild(newElement);

    container.appendChild(columnContainer);
    this.renderedColumns.push(column.id);
  }

  private static getColorScale(column: Column) {
    let domain = [0, 0];

    if (column instanceof NumberColumn || column instanceof  NumbersColumn) {
      const colorScale = scaleLinear<string, string>();
      domain = column.getMapping().domain;
      if (domain[0] < 0 && domain[1] > 0) { // diverging
        colorScale
          .domain([domain[0], 0, domain[1]]);
      } else {
        colorScale
          .domain([domain[0], domain[1]]);
      }
      colorScale.range(['white', column.color ? column.color : 'black']);
      return colorScale;
    }
    if (column instanceof CategoricalColumn) {
      const colorScale = scaleOrdinal<number, string>();
      const categories = column.categories;
      colorScale
        .domain(categories.map((v) => v.value))
        .range(categories.map((v) => v.color));
      return colorScale;
    }

    if (column instanceof SelectionColumn) {
      const colorScale = scaleOrdinal<boolean, string>();
      colorScale
        .domain([false, true])
        .range(['transparent', 'orange']);
      return colorScale;
    }

    if (column instanceof OverviewDetailColumn) {
      const colorScale = scaleOrdinal<boolean, string>();
      colorScale
        .domain([false, true])
        .range(['transparent', 'blue']);
      return colorScale;
    }
    return null;
  }

  private generateImage(data: any[][], colorScale: any) {
    const height = data.length;
    let width = 0;
    if(height > 0) {
      width = data[0].length;
    }
    const canvas = this.node.ownerDocument.createElement('canvas');
    canvas.setAttribute('height', `${height}`);
    canvas.setAttribute('width', `${width}`);
    this.drawOntoCanvas(data, colorScale, canvas);
    return canvas;
  }

  private drawOntoCanvas(data: any[][], colorScale: any, canvas: any) {
    if (colorScale === null) {
      return;
    }
    const ctx = <CanvasRenderingContext2D>canvas.getContext('2d');
    data.forEach((row, y) => {
      row.forEach((value, x) => {
        ctx.fillStyle = colorScale(value);
        ctx.fillRect(x, y, 1, 1);
      });
    });
    ctx.save();
  }

  expandTextureRenderer(use: boolean) {
    d3.select(this.node).classed('expand', use);
    if (!this.alreadyExpanded) {
      this.expandLaterRows.forEach((r) => r());
      this.alreadyExpanded = true;
    }
  }

  private dragStarted(element: any) {
    this.dragStartPosition = d3.mouse(element);
    this.dragOverlay = element.ownerDocument.createElement('div');
    this.dragOverlay.id = 'lu-drag-overlay';
    this.dragOverlay.style.width = `${element.scrollWidth}px`;
    element.appendChild(this.dragOverlay);
  }

  private dragged(element: any) {
    const currentPosition = d3.mouse(element);
    if (this.dragStartPosition[1] < currentPosition[1]) {
      this.dragOverlay.style.top = `${this.dragStartPosition[1]}px`;
      this.dragOverlay.style.height = `${currentPosition[1]-this.dragStartPosition[1]}px`;
    } else {
      this.dragOverlay.style.top = `${currentPosition[1]}px`;
      this.dragOverlay.style.height = `${this.dragStartPosition[1]-currentPosition[1]}px`;
    }
  }

  private dragEnd(element: any) {
    this.dragOverlay.remove();
    const currentPosition = d3.mouse(element);
    if(currentPosition[1] === this.dragStartPosition[1]) {
      if (!d3.event.sourceEvent.ctrlKey) {
        if (d3.event.sourceEvent.altKey) {
          this.engineRenderer.ctx.provider.setDetail([]);
        } else {
          this.engineRenderer.ctx.provider.setSelection([]);
        }
      }
      return;
    }
    const from = Math.min(currentPosition[1], this.dragStartPosition[1]);
    const to =  Math.max(currentPosition[1], this.dragStartPosition[1]);
    const fromData = parseInt(element.getAttribute('data-from'), 10);
    const toData = parseInt(element.getAttribute('data-to'), 10);
    const fromIndex = Math.max(Math.floor(from / element.offsetHeight * (toData - fromData) + fromData), fromData);
    const toIndex = Math.min(Math.ceil(to / element.offsetHeight * (toData - fromData) + fromData), toData);
    if (fromIndex > toIndex) {
      return;
    }
    const ranking = element.parentElement.getAttribute('data-ranking');
    const indices : number[] = d3.event.sourceEvent.ctrlKey ? (d3.event.sourceEvent.altKey ? this.engineRenderer.ctx.provider.getDetail() : this.engineRenderer.ctx.provider.getSelection()) :[];
    this.currentLocalData[ranking].slice(fromIndex, toIndex).forEach((d) => {
      indices.push(d.i);
    });
    if (d3.event.sourceEvent.altKey) {
      this.engineRenderer.ctx.provider.setDetail(indices);
    } else {
      this.engineRenderer.ctx.provider.setSelection(indices);
    }
  }

  addRanking(ranking: EngineRanking) {
    this.currentRankings.push(ranking);
    const rankingDiv = this.node.ownerDocument.createElement('div');
    rankingDiv.classList.add('rankingContainer');
    rankingDiv.setAttribute('data-ranking', `${this.currentRankings.length-1}`);
    this.node.appendChild(rankingDiv);
  }

  removeRanking(ranking: Ranking | null) {
    if (!ranking) {
      this.node.innerHTML = '';
    }
    const index = this.currentRankings.findIndex((r) => r.ranking === ranking);
    if (index < 0) {
      return; // error
    }
    this.currentRankings.splice(index, 1);
    this.engineRankings.splice(index, 1);
    d3.select(this.node).select(`[data-ranking="${index}"]`).remove();
  }

  destroy() {
    this.node.remove();
  }

  show() {
    this.node.style.display = null;
  }

  hide() {
    this.node.style.display = 'none';
  }

  s2d() {
    this.engineRenderer.ctx.provider.setDetail(this.engineRenderer.ctx.provider.getSelection());
    //this.detailParts = [];
    //let startIndex = -1;
    //for (let i = 0; i < this.currentLocalData[0].length; i++) {
    //  if (this.engineRenderer.ctx.provider.isSelected(this.currentLocalData[0][i].i)) {
    //    if (startIndex === -1) {
    //      startIndex = i;
    //    }
    //  } else if (startIndex !== -1) {
    //    this.detailParts.push([startIndex, i-1]);
    //    startIndex = -1;
    //  }
    //}
    //if (startIndex !== -1) {
    //  this.detailParts.push([startIndex, this.currentLocalData[0].length-1]);
    //}
    //this.renderColumns(this.currentRankings, this.currentLocalData);
  }

  d2s() {
    this.engineRenderer.ctx.provider.setSelection(this.engineRenderer.ctx.provider.getDetail());
    //d3.select(this.node).selectAll('.engineRendererContainer').nodes().forEach((v: any, i: number) => {
    //  const first = d3.select(v).select('.lu-row:first-child').node();
    //  const last = d3.select(v).select('.lu-row:last-child').node();
    //  if (typeof first !== 'undefined' && typeof last !== 'undefined') {
    //    this.engineRankings[i].selection.select(i !== 0, <any>first, <any>last);
    //  }
    //});
  }

  drawSelection() {
    d3.select(this.node).selectAll('.selectionColumn').nodes().forEach((v: any) => {
      let parent = v.parentElement;
      while (!parent.classList.contains('rowContainer')) {
        parent = parent.parentElement;
      }
      const fromIndex = parseInt(parent.getAttribute('data-from'), 10);
      const toIndex = parseInt(parent.getAttribute('data-to'), 10);

      const ctx = <CanvasRenderingContext2D>v.getContext('2d');

      for (let i = fromIndex; i <= toIndex; i++) {
        if (this.engineRenderer.ctx.provider.isSelected(this.currentLocalData[0][i].i)) {
          ctx.fillStyle = '#ffa809';
        } else {
          ctx.fillStyle = '#ffffff';
        }
        ctx.fillRect(2, i, 2, 1);
      }
      ctx.save();
    });
  }

  private handleUpdateEvent (r: EngineRanking) {
    if (this.skipUpdateEvents > 0) {
      this.skipUpdateEvents--;
    } else {
      this.engineRenderer.update([r]);
    }
  }
}