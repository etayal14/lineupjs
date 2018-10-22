import {IDataRow, IGroup} from '../model';
import Column from '../model/Column';
import {default as IRenderContext, ICellRendererFactory} from './interfaces';
import {noop} from './utils';
import {IDataProvider} from '../provider/ADataProvider';
import OverviewDetailColumn from '../model/OverviewDetailColumn';

/** @internal */
export default class OverviewDetailRenderer implements ICellRendererFactory {
  readonly title = 'Default';

  canRender(col: Column) {
    return col instanceof OverviewDetailColumn;
  }

  create(col: OverviewDetailColumn, ctx: IRenderContext) {
    return {
      template: `<div></div>`,
      update: (n: HTMLElement, d: IDataRow, i: number) => {
        n.onclick = function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) {
            const ranking = col.findMyRanker()!.id;
            if (rangeSelection(ctx.provider, ranking, d.i, i, event.ctrlKey)) {
              return;
            }
          }

          col.toggleValue(d);
        };
      },
      render: noop
    };
  }

  createGroup(col: OverviewDetailColumn) {
    return {
      template: `<div></div>`,
      update: (n: HTMLElement, _group: IGroup, rows: IDataRow[]) => {
        const selected = rows.reduce((act, r) => col.getValue(r) ? act + 1 : act, 0);
        const all = selected >= rows.length / 2;
        if (all) {
          n.classList.add('lu-group-selected');
        } else {
          n.classList.remove('lu-group-selected');
        }
        n.onclick = function (event) {
          event.preventDefault();
          event.stopPropagation();
          const value = n.classList.toggle('lu-group-selected');
          col.setValues(rows, value);
        };
      }
    };
  }

  createSummary(col: OverviewDetailColumn, context: IRenderContext) {
    return {
      template: `<div title="(Un)Detail All" data-icon="unchecked"></div>`,
      update: (node: HTMLElement) => {
        node.onclick = (evt) => {
          evt.stopPropagation();
          const icon = node.dataset.icon;
          if (icon === 'unchecked') {
            context.provider.detailAllOf(col.findMyRanker()!);
            node.dataset.icon = 'checked';
          } else {
            context.provider.setDetail([]);
            node.dataset.icon = 'unchecked';
          }
        };
      }
    };
  }
}

/** @internal */
export function rangeSelection(provider: IDataProvider, rankingId: string, dataIndex: number, relIndex: number, ctrlKey: boolean) {
  const ranking = provider.getRankings().find((d) => d.id === rankingId);
  if (!ranking) { // no known reference
    return false;
  }
  const selection = provider.getDetail();
  if (selection.length === 0 || selection.includes(dataIndex)) {
    return false; // no other or deselect
  }
  const order = ranking.getOrder();
  const lookup = new Map(ranking.getOrder().map((d, i) => <[number, number]>[d, i]));
  const distances = selection.map((d) => {
    const index = (lookup.has(d) ? lookup.get(d)! : Infinity);
    return {s: d, index, distance: Math.abs(relIndex - index)};
  });
  const nearest = distances.sort((a, b) => a.distance - b.distance)[0]!;
  if (!isFinite(nearest.distance)) {
    return false; // all outside
  }
  if (!ctrlKey) {
    selection.splice(0, selection.length);
    selection.push(nearest.s);
  }
  if (nearest.index < relIndex) {
    for(let i = nearest.index + 1; i <= relIndex; ++i) {
      selection.push(order[i]);
    }
  } else {
    for(let i = relIndex; i <= nearest.index; ++i) {
      selection.push(order[i]);
    }
  }
  provider.setDetail(selection);
  return true;
}