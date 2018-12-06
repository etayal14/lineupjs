import {IDataRow, IGroup, IOrderedGroup} from '../model';
import {default as ActionColumn} from '../model/ActionColumn';
import Column from '../model/Column';
import IRenderContext, {ERenderMode, ICellRendererFactory} from './interfaces';
import {forEachChild, noRenderer} from './utils';
import {cssClass} from '../styles';

/** @internal */
export default class ActionRenderer implements ICellRendererFactory {
  readonly title = 'Default';

  canRender(col: Column, mode: ERenderMode) {
    return col instanceof ActionColumn && mode !== ERenderMode.SUMMARY;
  }

  create(col: ActionColumn) {
    const actions = col.actions;
    return {
      template: `<div class="${cssClass('actions')} ${cssClass('hover-only')}">${actions.map((a) => `<span title='${a.name}' class='${a.className || ''}'>${a.icon || ''}</span>`).join('')}</div>`,
      update: (n: HTMLElement, d: IDataRow) => {
        forEachChild(n, (ni: HTMLSpanElement, i: number) => {
          ni.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            setTimeout(() => actions[i].action(d), 1); // async
          };
        });
      }
    };
  }

  createGroup(col: ActionColumn, context: IRenderContext) {
    const actions = col.groupActions;
    return {
      template: `<div class="${cssClass('actions')} ${cssClass('hover-only')}">${actions.map((a) => `<span title='${a.name}' class='${a.className || ''}'>${a.icon || ''}</span>`).join('')}</div>`,
      update: (n: HTMLElement, group: IOrderedGroup) => {
        forEachChild(n, (ni: HTMLSpanElement, i: number) => {
          ni.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            context.tasks.groupRows(col, group, (r) => r, (rows) => {
              if (Array.isArray(rows)) {
                actions[i].action(group, rows);
              }
            });
          };
        });
      }
    };
  }

  createSummary() {
    return noRenderer;
  }
}
