/**
 * Created by Samuel Gratzl on 14.08.2015.
 */

///<reference path='../typings/tsd.d.ts' />
import d3 = require('d3');
import utils = require('./utils');
import model = require('./model');
import renderer = require('./renderer');
import provider = require('./provider');
import dialogs = require('./ui_dialogs');
import {IRenderContext, IDOMRenderContext, ICanvasRenderContext} from './renderer';
import {forEach} from './utils';

class PoolEntry {
  used: number = 0;

  constructor(public desc: model.IColumnDesc) {

  }
}

/**
 * utility function to generate the tooltip text with description
 * @param col the column
 */
function toFullTooltip(col: { label: string, description?: string}) {
  var base = col.label;
  if (col.description != null && col.description !== '') {
    base += '\n' + col.description;
  }
  return base;
}

export class PoolRenderer {
  private options = {
    layout: 'vertical',
    elemWidth: 100,
    elemHeight: 40,
    width: 100,
    height: 500,
    additionalDesc: [],
    hideUsed: true,
    addAtEndOnClick: false
  };

  private $node: d3.Selection<any>;
  private entries: PoolEntry[];

  constructor(private data: provider.DataProvider, parent: Element, options: any = {}) {
    utils.merge(this.options, options);

    this.$node = d3.select(parent).append('div').classed('lu-pool', true);

    this.changeDataStorage(data);
  }

  changeDataStorage(data: provider.DataProvider) {
    if (this.data) {
      this.data.on(['addColumn.pool', 'removeColumn.pool', 'addRanking.pool', 'removeRanking.pool', 'addDesc.pool'], null);
    }
    this.data = data;
    this.entries = data.getColumns().concat(this.options.additionalDesc).map((d) => new PoolEntry(d));
    data.on(['addDesc.pool'], (desc) => {
      this.entries.push(new PoolEntry(desc));
      this.update();
    });
    if (this.options.hideUsed) {
      var that = this;
      data.on(['addColumn.pool', 'removeColumn.pool'], function (col) {
        var desc = col.desc, change = this.type === 'addColumn' ? 1 : -1;
        that.entries.some((entry) => {
          if (entry.desc !== desc) {
            return false;
          }
          entry.used += change;
          return true;
        });
        that.update();
      });
      data.on(['addRanking.pool', 'removeRanking.pool'], function (ranking) {
        var descs = ranking.flatColumns.map((d) => d.desc), change = this.type === 'addRanking' ? 1 : -1;
        that.entries.some((entry) => {
          if (descs.indexOf(entry.desc) < 0) {
            return false;
          }
          entry.used += change;
          return true;
        });
        that.update();
      });
      data.getRankings().forEach((ranking) => {
        var descs = ranking.flatColumns.map((d) => d.desc), change = +1;
        that.entries.some((entry) => {
          if (descs.indexOf(entry.desc) < 0) {
            return false;
          }
          entry.used += change;
        });
      });
    }
  }

  remove() {
    this.$node.remove();
    if (this.data) {
      this.data.on(['addColumn.pool', 'removeColumn.pool', 'addRanking.pool', 'removeRanking.pool', 'addDesc.pool'], null);
    }
  }

  update() {
    var data = this.data;
    var descToShow = this.entries.filter((e) => e.used === 0).map((d) => d.desc);
    var $headers = this.$node.selectAll('div.header').data(descToShow);
    var $headers_enter = $headers.enter().append('div').attr({
      'class': 'header',
      'draggable': true
    }).on('dragstart', (d) => {
      var e = <DragEvent>(<any>d3.event);
      e.dataTransfer.effectAllowed = 'copyMove'; //none, copy, copyLink, copyMove, link, linkMove, move, all
      e.dataTransfer.setData('text/plain', d.label);
      e.dataTransfer.setData('application/caleydo-lineup-column', JSON.stringify(data.toDescRef(d)));
      if (model.isNumberColumn(d)) {
        e.dataTransfer.setData('application/caleydo-lineup-column-number', JSON.stringify(data.toDescRef(d)));
      }
    }).style({
      width: this.options.elemWidth + 'px',
      height: this.options.elemHeight + 'px'
    });
    if (this.options.addAtEndOnClick) {
      $headers_enter.on('click', (d) => {
        this.data.push(this.data.getLastRanking(), d);
      });
    }
    $headers_enter.append('span').classed('label', true).text((d) => d.label);
    $headers.attr('class', (d) => `header ${((<any>d).cssClass || '')} ${d.type}`);
    $headers.style({
      'transform': (d, i) => {
        var pos = this.layout(i);
        return 'translate(' + pos.x + 'px,' + pos.y + 'px)';
      },
      'background-color': (d) => {
        const s = (<any>d);
        return s.cssClass ? null : s.color || model.Column.DEFAULT_COLOR;
      }
    });
    $headers.attr({
      title: (d) => toFullTooltip(d)
    });
    $headers.select('span').text((d) => d.label);
    $headers.exit().remove();

    //compute the size of this node
    switch (this.options.layout) {
      case 'horizontal':
        this.$node.style({
          width: (this.options.elemWidth * descToShow.length) + 'px',
          height: (this.options.elemHeight * 1) + 'px'
        });
        break;
      case 'grid':
        var perRow = d3.round(this.options.width / this.options.elemWidth, 0);
        this.$node.style({
          width: perRow * this.options.elemWidth + 'px',
          height: Math.ceil(descToShow.length / perRow) * this.options.elemHeight + 'px'
        });
        break;
      //case 'vertical':
      default:
        this.$node.style({
          width: (this.options.elemWidth * 1) + 'px',
          height: (this.options.elemHeight * descToShow.length) + 'px'
        });
        break;
    }
  }

  private layout(i: number) {
    switch (this.options.layout) {
      case 'horizontal':
        return {x: i * this.options.elemWidth, y: 0};
      case 'grid':
        var perRow = d3.round(this.options.width / this.options.elemWidth, 0);
        return {x: (i % perRow) * this.options.elemWidth, y: Math.floor(i / perRow) * this.options.elemHeight};
      //case 'vertical':
      default:
        return {x: 0, y: i * this.options.elemHeight};
    }
  }
}

export interface IRankingHook {
  ($node: d3.Selection<model.Ranking>): void;
}

export function dummyRankingButtonHook() {
  return null;
}

export class HeaderRenderer {
  private options = {
    slopeWidth: 150,
    columnPadding: 5,
    headerHistogramHeight: 40,
    headerHeight: 20,
    manipulative: true,
    histograms: false,

    filterDialogs: dialogs.filterDialogs(),
    linkTemplates: [],
    searchAble: (col: model.Column) => col instanceof model.StringColumn,
    sortOnLabel: true,

    autoRotateLabels: false,
    rotationHeight: 50, //in px
    rotationDegree: -20, //in deg

    freezeCols: 0,

    rankingButtons: <IRankingHook>dummyRankingButtonHook
  };

  $node: d3.Selection<any>;

  private histCache = d3.map<Promise<any>>();

  private dragHandler = d3.behavior.drag<model.Column>()
  //.origin((d) => d)
    .on('dragstart', function () {
      d3.select(this).classed('dragging', true);
      (<any>d3.event).sourceEvent.stopPropagation();
      (<any>d3.event).sourceEvent.preventDefault();
    })
    .on('drag', function (d) {
      //the new width
      var newValue = Math.max(d3.mouse(this.parentNode)[0], 2);
      d.setWidth(newValue);
      (<any>d3.event).sourceEvent.stopPropagation();
      (<any>d3.event).sourceEvent.preventDefault();
    })
    .on('dragend', function (d) {
      d3.select(this).classed('dragging', false);
      (<any>d3.event).sourceEvent.stopPropagation();

      (<any>d3.event).sourceEvent.preventDefault();
    });

  private dropHandler = utils.dropAble(['application/caleydo-lineup-column-ref', 'application/caleydo-lineup-column'], (data, d: model.Column, copy) => {
    var col: model.Column = null;
    if ('application/caleydo-lineup-column-ref' in data) {
      var id = data['application/caleydo-lineup-column-ref'];
      col = this.data.find(id);
      if (copy) {
        col = this.data.clone(col);
      } else {
        col.removeMe();
      }
    } else {
      var desc = JSON.parse(data['application/caleydo-lineup-column']);
      col = this.data.create(this.data.fromDescRef(desc));
    }
    if (d instanceof model.Column) {
      return d.insertAfterMe(col) != null;
    } else {
      var r = this.data.getLastRanking();
      return r.push(col) !== null;
    }
  });


  constructor(private data: provider.DataProvider, parent: Element, options: any = {}) {
    utils.merge(this.options, options);

    this.$node = d3.select(parent).append('div').classed('lu-header', true);
    this.$node.append('div').classed('drop', true).call(this.dropHandler);

    this.changeDataStorage(data);
  }

  changeDataStorage(data: provider.DataProvider) {
    if (this.data) {
      this.data.on(['dirtyHeader.headerRenderer', 'orderChanged.headerRenderer', 'selectionChanged.headerRenderer'], null);
    }
    this.data = data;
    data.on('dirtyHeader.headerRenderer', utils.delayedCall(this.update.bind(this), 1));
    if (this.options.histograms) {
      data.on('orderChanged.headerRenderer', () => {
        this.updateHist();
        this.update();
      });
      data.on('selectionChanged.headerRenderer', utils.delayedCall(this.drawSelection.bind(this), 1));

    }
  }

  get sharedHistCache() {
    return this.histCache;
  }

  /**
   * defines the current header height in pixel
   * @returns {number}
   */
  currentHeight() {
    return parseInt(this.$node.style('height'), 10);
  }

  private updateHist() {
    var rankings = this.data.getRankings();
    rankings.forEach((ranking) => {
      const order = ranking.getOrder();
      const cols = ranking.flatColumns;
      const histo = order == null ? null : this.data.stats(order);
      cols.filter((d) => d instanceof model.NumberColumn && !d.isHidden()).forEach((col: any) => {
        this.histCache.set(col.id, histo === null ? null : histo.stats(col));
      });
      cols.filter((d) => model.isCategoricalColumn(d) && !d.isHidden()).forEach((col: any) => {
        this.histCache.set(col.id, histo === null ? null : histo.hist(col));
      });
    });
  }

  /**
   * update the selection in the histograms
   */
  drawSelection() {
    if (!this.options.histograms) {
      return;
    }
    //highlight the bins in the histograms
    const node = <HTMLElement>this.$node.node();

    [].slice.call(node.querySelectorAll('div.bar')).forEach((d) => d.classList.remove('selected'));
    var indices = this.data.getSelection();
    if (indices.length <= 0) {
      return;
    }
    this.data.view(indices).then((data) => {
      //get the data

      var rankings = this.data.getRankings();

      rankings.forEach((ranking) => {
        const cols = ranking.flatColumns;
        //find all number histograms
        cols.filter((d) => d instanceof model.NumberColumn && !d.isHidden()).forEach((col: model.NumberColumn) => {
          const bars = [].slice.call(node.querySelectorAll(`div.header[data-id="${col.id}"] div.bar`));
          data.forEach((d) => {
            const v = col.getValue(d);
            //choose the right bin
            for (let i = 1; i < bars.length; ++i) {
              let bar = bars[i];
              if (bar.dataset.x > v) { //previous bin
                bars[i - 1].classList.add('selected');
                break;
              } else if (i === bars.length - 1) { //last bin
                bar.classList.add('selected');
                break;
              }
            }
          });
        });
        cols.filter((d) => model.isCategoricalColumn(d) && !d.isHidden()).forEach((col: model.CategoricalColumn) => {
          const header = node.querySelector(`div.header[data-id="${col.id}"]`);
          data.forEach((d) => {
            const cats = col.getCategories(d);
            (cats || []).forEach((cat) => {
              header.querySelector(`div.bar[data-cat="${cat}"]`).classList.add('selected');
            });
          });
        });
      });
    });
  }

  private renderRankingButtons(rankings: model.Ranking[], rankingsOffsets: number[]) {
    const $rankingbuttons = this.$node.selectAll('div.rankingbuttons').data(rankings);
    $rankingbuttons.enter().append('div')
      .classed('rankingbuttons', true)
      .call(this.options.rankingButtons);
    $rankingbuttons.style('left', (d, i) => rankingsOffsets[i] + 'px');
    $rankingbuttons.exit().remove();
  }

  update() {
    const that = this;
    const rankings = this.data.getRankings();

    var shifts = [], offset = 0, rankingOffsets = [];
    rankings.forEach((ranking) => {
      offset += ranking.flatten(shifts, offset, 1, this.options.columnPadding) + this.options.slopeWidth;
      rankingOffsets.push(offset - this.options.slopeWidth);
    });
    //real width
    offset -= this.options.slopeWidth;

    var columns = shifts.map((d) => d.col);

    //update all if needed
    if (this.options.histograms && this.histCache.empty() && rankings.length > 0) {
      this.updateHist();
    }

    this.renderColumns(columns, shifts);

    if (this.options.rankingButtons !== dummyRankingButtonHook) {
      this.renderRankingButtons(rankings, rankingOffsets);
    }

    function countMultiLevel(c: model.Column): number {
      if (model.isMultiLevelColumn(c) && !(<model.IMultiLevelColumn>c).getCollapsed() && !c.getCompressed()) {
        return 1 + Math.max.apply(Math, (<model.IMultiLevelColumn>c).children.map(countMultiLevel));
      }
      return 1;
    }

    const levels = Math.max.apply(Math, columns.map(countMultiLevel));
    var height = (this.options.histograms ? this.options.headerHistogramHeight : this.options.headerHeight) + (levels - 1) * this.options.headerHeight;

    if (this.options.autoRotateLabels) {
      //check if we have overflows
      var rotatedAny = false;
      this.$node.selectAll('div.header')
        .style('height', height + 'px').select('div.lu-label').each(function (d) {
        const w = this.querySelector('span.lu-label').offsetWidth;
        const actWidth = d.getWidth();
        if (w > (actWidth + 30)) { //rotate
          d3.select(this).style('transform', `rotate(${that.options.rotationDegree}deg)`);
          rotatedAny = true;
        } else {
          d3.select(this).style('transform', null);
        }
      });
      this.$node.selectAll('div.header').style('margin-top', rotatedAny ? this.options.rotationHeight + 'px' : null);
      height += rotatedAny ? this.options.rotationHeight : 0;
    }
    this.$node.style('height', height + 'px');
  }

  private createToolbar($node: d3.Selection<model.Column>) {
    const filterDialogs = this.options.filterDialogs,
      provider = this.data,
      that = this;
    var $regular = $node.filter(d=> !(d instanceof model.Ranking)),
      $stacked = $node.filter(d=> d instanceof model.StackColumn),
      $multilevel = $node.filter(d=> model.isMultiLevelColumn(d));

    //edit weights
    $stacked.append('i').attr('class', 'fa fa-tasks').attr('title', 'Edit Weights').on('click', function (d) {
      dialogs.openEditWeightsDialog(<model.StackColumn>d, d3.select(this.parentNode.parentNode));
      d3.event.stopPropagation();
    });
    //rename
    $regular.append('i').attr('class', 'fa fa-pencil-square-o').attr('title', 'Rename').on('click', function (d) {
      dialogs.openRenameDialog(d, d3.select(this.parentNode.parentNode));
      d3.event.stopPropagation();
    });
    //clone
    $regular.append('i').attr('class', 'fa fa-code-fork').attr('title', 'Generate Snapshot').on('click', function (d) {
      provider.takeSnapshot(d);
      d3.event.stopPropagation();
    });
    //edit link
    $node.filter((d) => d instanceof model.LinkColumn).append('i').attr('class', 'fa fa-external-link').attr('title', 'Edit Link Pattern').on('click', function (d) {
      dialogs.openEditLinkDialog(<model.LinkColumn>d, d3.select(this.parentNode.parentNode), [].concat((<any>d.desc).templates || [], that.options.linkTemplates));
      d3.event.stopPropagation();
    });
    //edit script
    $node.filter((d) => d instanceof model.ScriptColumn).append('i').attr('class', 'fa fa-gears').attr('title', 'Edit Combine Script').on('click', function (d) {
      dialogs.openEditScriptDialog(<model.ScriptColumn>d, d3.select(this.parentNode.parentNode));
      d3.event.stopPropagation();
    });
    //filter
    $node.filter((d) => filterDialogs.hasOwnProperty(d.desc.type)).append('i').attr('class', 'fa fa-filter').attr('title', 'Filter').on('click', function (d) {
      filterDialogs[d.desc.type](d, d3.select(this.parentNode.parentNode), provider);
      d3.event.stopPropagation();
    });
    //search
    $node.filter((d) => this.options.searchAble(d)).append('i').attr('class', 'fa fa-search').attr('title', 'Search').on('click', function (d) {
      dialogs.openSearchDialog(d, d3.select(this.parentNode.parentNode), provider);
      d3.event.stopPropagation();
    });
    //collapse
    $regular.append('i')
      .attr('class', 'fa')
      .classed('fa-toggle-left', (d: model.Column) => !d.getCompressed())
      .classed('fa-toggle-right', (d: model.Column) => d.getCompressed())
      .attr('title', '(Un)Collapse')
      .on('click', function (d: model.Column) {
        d.setCompressed(!d.getCompressed());
        d3.select(this)
          .classed('fa-toggle-left', !d.getCompressed())
          .classed('fa-toggle-right', d.getCompressed());
        d3.event.stopPropagation();
      });
    //compress
    $multilevel.append('i')
      .attr('class', 'fa')
      .classed('fa-compress', (d: model.IMultiLevelColumn) => !d.getCollapsed())
      .classed('fa-expand', (d: model.IMultiLevelColumn) => d.getCollapsed())
      .attr('title', 'Compress/Expand')
      .on('click', function (d: model.IMultiLevelColumn) {
        d.setCollapsed(!d.getCollapsed());
        d3.select(this)
          .classed('fa-compress', !d.getCollapsed())
          .classed('fa-expand', d.getCollapsed());
        d3.event.stopPropagation();
      });
    //remove
    $node.append('i').attr('class', 'fa fa-times').attr('title', 'Hide').on('click', (d) => {
      if (d instanceof model.RankColumn) {
        provider.removeRanking(d.findMyRanker());
        if (provider.getRankings().length === 0) { //create at least one
          provider.pushRanking();
        }
      } else {
        d.removeMe();
      }
      d3.event.stopPropagation();
    });
  }

  updateFreeze(left: number) {
    const numColumns = this.options.freezeCols;
    this.$node.selectAll('div.header')
      .style('z-index', (d, i) => i < numColumns ? 1 : null)
      .style('transform', (d, i) => i < numColumns ? `translate(${left}px,0)` : null);
  }

  private renderColumns(columns: model.Column[], shifts, $base: d3.Selection<any> = this.$node, clazz: string = 'header') {
    var $headers = $base.selectAll('div.' + clazz).data(columns, (d) => d.id);
    var $headers_enter = $headers.enter().append('div').attr({
      'class': clazz
    })
      .on('click', (d) => {
        if (this.options.manipulative && !d3.event.defaultPrevented && d3.event.currentTarget === d3.event.target) {
          d.toggleMySorting();
        }
      });
    var $header_enter_div = $headers_enter.append('div').classed('lu-label', true)
      .on('click', (d) => {
        if (this.options.manipulative && !d3.event.defaultPrevented) {
          d.toggleMySorting();
        }
      })
      .on('dragstart', (d) => {
        var e = <DragEvent>(<any>d3.event);
        e.dataTransfer.effectAllowed = 'copyMove'; //none, copy, copyLink, copyMove, link, linkMove, move, all
        e.dataTransfer.setData('text/plain', d.label);
        e.dataTransfer.setData('application/caleydo-lineup-column-ref', d.id);
        var ref = JSON.stringify(this.data.toDescRef(d.desc));
        e.dataTransfer.setData('application/caleydo-lineup-column', ref);
        if (model.isNumberColumn(d)) {
          e.dataTransfer.setData('application/caleydo-lineup-column-number', ref);
          e.dataTransfer.setData('application/caleydo-lineup-column-number-ref', d.id);
        }
      });
    $header_enter_div.append('i').attr('class', 'fa fa sort_indicator');
    $header_enter_div.append('span').classed('lu-label', true).attr({
      'draggable': this.options.manipulative
    });

    if (this.options.manipulative) {
      $headers_enter.append('div').classed('handle', true)
        .call(this.dragHandler)
        .style('width', this.options.columnPadding + 'px')
        .call(this.dropHandler);
      $headers_enter.append('div').classed('toolbar', true).call(this.createToolbar.bind(this));
    }

    if (this.options.histograms) {
      $headers_enter.append('div').classed('histogram', true);
    }

    $headers.style({
      width: (d, i) => (shifts[i].width + this.options.columnPadding) + 'px',
      left: (d, i) => shifts[i].offset + 'px',
      'background-color': (d) => d.color
    });
    $headers.attr({
      'class': (d) => `${clazz} ${d.cssClass || ''} ${(d.getCompressed() ? 'compressed' : '')} ${d.headerCssClass} ${this.options.autoRotateLabels ? 'rotateable' : ''} ${d.isFiltered() ? 'filtered' : ''}`,
      title: (d) => toFullTooltip(d),
      'data-id': (d) => d.id,
    });
    $headers.select('i.sort_indicator').attr('class', (d) => {
      var r = d.findMyRanker();
      if (r && r.getSortCriteria().col === d) {
        return 'sort_indicator fa fa-sort-' + (r.getSortCriteria().asc ? 'asc' : 'desc');
      }
      return 'sort_indicator fa';
    });
    $headers.select('span.lu-label').text((d) => d.label);

    var that = this;
    $headers.filter((d) => model.isMultiLevelColumn(d)).each(function (col: model.IMultiLevelColumn) {
      if (col.getCollapsed() || col.getCompressed()) {
        d3.select(this).selectAll('div.' + clazz + '_i').remove();
      } else {
        let s_shifts = [];
        col.flatten(s_shifts, 0, 1, that.options.columnPadding);

        let s_columns = s_shifts.map((d) => d.col);
        that.renderColumns(s_columns, s_shifts, d3.select(this), clazz + (clazz.substr(clazz.length - 2) !== '_i' ? '_i' : ''));
      }
    }).select('div.lu-label').call(utils.dropAble(['application/caleydo-lineup-column-number-ref', 'application/caleydo-lineup-column-number'], (data, d: model.IMultiLevelColumn, copy) => {
      var col: model.Column = null;
      if ('application/caleydo-lineup-column-number-ref' in data) {
        var id = data['application/caleydo-lineup-column-number-ref'];
        col = this.data.find(id);
        if (copy) {
          col = this.data.clone(col);
        } else if (col) {
          col.removeMe();
        }
      } else {
        var desc = JSON.parse(data['application/caleydo-lineup-column-number']);
        col = this.data.create(this.data.fromDescRef(desc));
      }
      return d.push(col) != null;
    }));

    if (this.options.histograms) {

      $headers.filter((d) => model.isCategoricalColumn(d)).each(function (col: model.CategoricalColumn) {
        var $this = d3.select(this).select('div.histogram');
        var hist = that.histCache.get(col.id);
        if (hist) {
          hist.then((stats: model.ICategoricalStatistics) => {
            const $bars = $this.selectAll('div.bar').data(stats.hist);
            $bars.enter().append('div').classed('bar', true);
            const sx = d3.scale.ordinal().domain(col.categories).rangeBands([0, 100], 0.1);
            const sy = d3.scale.linear().domain([0, stats.maxBin]).range([0, 100]);
            $bars.style({
              left: (d) => sx(d.cat) + '%',
              width: (d) => sx.rangeBand() + '%',
              top: (d) => (100 - sy(d.y)) + '%',
              height: (d) => sy(d.y) + '%',
              'background-color': (d) => col.colorOf(d.cat)
            }).attr({
              title: (d) => `${d.cat}: ${d.y}`,
              'data-cat': (d) => d.cat
            });
            $bars.exit().remove();
          });
        }
      });
      $headers.filter((d) => d instanceof model.NumberColumn).each(function (col: model.Column) {
        var $this = d3.select(this).select('div.histogram');
        var hist = that.histCache.get(col.id);
        if (hist) {
          hist.then((stats: model.IStatistics) => {
            const $bars = $this.selectAll('div.bar').data(stats.hist);
            $bars.enter().append('div').classed('bar', true);
            const sx = d3.scale.ordinal().domain(d3.range(stats.hist.length).map(String)).rangeBands([0, 100], 0.1);
            const sy = d3.scale.linear().domain([0, stats.maxBin]).range([0, 100]);
            $bars.style({
              left: (d, i) => sx(String(i)) + '%',
              width: (d, i) => sx.rangeBand() + '%',
              top: (d) => (100 - sy(d.y)) + '%',
              height: (d) => sy(d.y) + '%'
            }).attr({
              title: (d, i) => `Bin ${i}: ${d.y}`,
              'data-x': (d) => d.x
            });
            $bars.exit().remove();

            var $mean = $this.select('div.mean');
            if ($mean.empty()) {
              $mean = $this.append('div').classed('mean', true);
            }
            $mean.style('left', (stats.mean * 100) + '%');
          });
        }
      });
    }

    $headers.exit().remove();
  }
}


export interface ISlicer {
  (start: number, length: number, row2y: (i: number) => number): { from: number; to: number };
}

export interface IBodyRenderer extends utils.AEventDispatcher {
  histCache: d3.Map<Promise<model.IStatistics>>;

  node: Element;

  setOption(key: string, value: any);

  changeDataStorage(data: provider.DataProvider);

  select(dataIndex: number, additional?: boolean);

  updateFreeze(left: number);

  update();
}

interface IBodyRenderContext extends renderer.IRenderContext<any> {
  cellY(index: number): number;
  cellPrevY(index: number): number;
}

interface IRankingColumnData {
  column: model.Column;
  renderer: any;
  shift: number;
}

interface IRankingData {
  id: string;
  ranking: model.Ranking;
  order: number[];
  shift: number;
  width: number;
  frozen: IRankingColumnData[];
  columns: IRankingColumnData[];
  data: Promise<{v: any, dataIndex: number}[]>;
}

export interface IDOMMapping {
  root: string;
  g: string;

  setSize(n: HTMLElement, width: number, height: number);

  translate(n: SVGElement | HTMLElement, x: number, y: number);
  transform<T>(sel: d3.Selection<T>, callback: (d: T, i: number) => [number,number]);
  creator(col: model.Column, renderers: {[key: string]: renderer.ICellRendererFactory}, context: renderer.IDOMRenderContext): renderer.IDOMCellRenderer<SVGElement | HTMLElement>;

  bg: string;
  updateBG(sel: d3.Selection<any>, callback: (d: any, i: number, j: number) => [number, number]);

  meanLine: string;
  updateMeanLine($mean: d3.Selection<any>, x: number, height: number);

  slopes: string;
  updateSlopes($slopes: d3.Selection<any>, width: number, height: number, callback: (d, i) => number);
}

const domMappings = {
  svg: {
    root: 'svg',
    g: 'g',

    setSize: (n: HTMLElement, width: number, height: number) => {
      n.setAttribute('width', String(width));
      n.setAttribute('height', String(height));
    },

    bg: 'rect',
    updateBG: (sel: d3.Selection<any>, callback: (d: any, i: number, j: number) => [number, number]) => {
      sel.attr({
        height: (d, i, j?) => callback(d, i, j)[1],
        width: (d, i, j?) => callback(d, i, j)[0]
      });
    },
    meanLine: 'line',
    updateMeanLine: ($mean: d3.Selection<any>, x: number, height: number) => {
      $mean.attr('x1', 1 + x) //TODO don't know why +1 such that header and body lines are aligned
        .attr('x2', 1 + x)
        .attr('y2', height);
    },
    slopes: 'g',
    updateSlopes: ($slopes: d3.Selection<any>, width: number, height: number, callback: (d, i) => number) => {
      $slopes.attr('transform', (d, i) => `translate(${callback(d, i)},0)`);
    },
    creator: renderer.createSVG,
    translate: (n: SVGElement, x: number, y: number) => n.setAttribute('transform', `translate(${x},${y})`),
    transform: (sel: d3.Selection<any>, callback: (d: any, i: number)=> [number,number]) => {
      sel.attr('transform', (d, i) => {
        const r = callback(d, i);
        return `translate(${r[0]},${r[1]})`;
      });
    }
  },
  html: {
    root: 'div',
    g: 'div',

    setSize: (n: HTMLElement, width: number, height: number) => {
      n.style.width = width + 'px';
      n.style.height = height + 'px';
    },

    bg: 'div',
    updateBG: (sel: d3.Selection<any>, callback: (d: any, i: number, j: number) => [number, number]) => {
      sel.style({
        height: (d, i, j?) => callback(d, i, j)[1] + 'px',
        width: (d, i, j?) => callback(d, i, j)[0] + 'px'
      });
    },
    meanLine: 'div',
    updateMeanLine: ($mean: d3.Selection<any>, x: number, height: number) => {
      $mean.style('left', x + 'px').style('height', height + 'px');
    },
    slopes: 'svg',
    updateSlopes: ($slopes: d3.Selection<any>, width: number, height: number, callback: (d, i) => number) => {
      $slopes.attr('width', width).attr('height', height).style('left', (d, i)=>callback(d, i) + 'px');
    },

    creator: renderer.createHTML,
    translate: (n: HTMLElement, x: number, y: number) => n.style.transform = `translate(${x}px,${y}px)`,
    transform: (sel: d3.Selection<any>, callback: (d: any, i: number)=> [number,number]) => {
      sel.style('transform', (d, i) => {
        const r = callback(d, i);
        return `translate(${r[0]}px,${r[1]}px)`;
      });
    }
  }
};

export class ABodyRenderer extends utils.AEventDispatcher implements IBodyRenderer {
  protected options = {
    rowHeight: 20,
    rowPadding: 1,
    rowBarPadding: 1,
    idPrefix: '',
    slopeWidth: 150,
    columnPadding: 5,
    stacked: true,
    animation: false, //200
    animationDuration: 1000,

    renderers: utils.merge({}, renderer.renderers),

    meanLine: false,

    actions: [],

    freezeCols: 0
  };

  protected $node: d3.Selection<any>;

  histCache = d3.map<Promise<model.IStatistics>>();

  constructor(protected data: provider.DataProvider, parent: Element, private slicer: ISlicer, root: string, options = {}) {
    super();
    //merge options
    utils.merge(this.options, options);

    this.$node = d3.select(parent).append(root).classed('lu-body', true);

    this.changeDataStorage(data);
  }

  createEventList() {
    return super.createEventList().concat(['hoverChanged', 'renderFinished']);
  }

  get node() {
    return <HTMLElement>this.$node.node();
  }

  setOption(key: string, value: any) {
    this.options[key] = value;
  }

  changeDataStorage(data: provider.DataProvider) {
    if (this.data) {
      this.data.on(['dirtyValues.bodyRenderer', 'selectionChanged.bodyRenderer'], null);
    }
    this.data = data;
    data.on('dirtyValues.bodyRenderer', utils.delayedCall(this.update.bind(this), 1));
    data.on('selectionChanged.bodyRenderer', utils.delayedCall((selection, jumpToFirst) => {
      if (jumpToFirst && selection.length > 0) {
        this.jumpToSelection();
      }
      this.drawSelection();
    }, 1));
  }

  protected jumpToSelection() {
    const indices = this.data.getSelection();
    const rankings = this.data.getRankings();
    if (indices.length <= 0 || rankings.length <= 0) {
      return;
    }
    const order = rankings[0].getOrder();
    const visibleRange = this.slicer(0, order.length, (i) => i * this.options.rowHeight);
    const visibleOrder = order.slice(visibleRange.from, visibleRange.to);
    //if any of the selected indices is in the visible range - done
    if (indices.some((d) => visibleOrder.indexOf(d) >= 0)) {
      return;
    }
    //TODO find the closest not visible one in the indices list
    //
  }

  protected showMeanLine(col: model.Column) {
    //show mean line if option is enabled and top level
    return this.options.meanLine && model.isNumberColumn(col) && !col.getCompressed() && col.parent instanceof model.Ranking;
  }

  protected createContext(index_shift: number, creator: (col: model.Column, renderers: {[key: string]: renderer.ICellRendererFactory}, context: renderer.IRenderContext<any>)=> any): IBodyRenderContext {
    const options = this.options;

    function findOption(key: string, default_: any) {
      if (key in options) {
        return options[key];
      }
      if (key.indexOf('.') > 0) {
        let p = key.substring(0, key.indexOf('.'));
        key = key.substring(key.indexOf('.') + 1);
        if (p in options && key in options[p]) {
          return options[p][key];
        }
      }
      return default_;
    }

    return {
      cellY: (index: number) => (index + index_shift) * (this.options.rowHeight),
      cellPrevY: (index: number) => (index + index_shift) * (this.options.rowHeight),

      idPrefix: options.idPrefix,

      option: findOption,

      rowHeight(index: number) {
        return options.rowHeight * (1 - options.rowPadding);
      },

      renderer(col: model.Column) {
        return creator(col, options.renderers, this);
      }
    };
  }

  protected animated<T>($rows: d3.Selection<T>): d3.Selection<T> {
    if (this.options.animationDuration > 0 && this.options.animation) {
      return <any>$rows.transition().duration(this.options.animationDuration);
    }
    return $rows;
  }

  private createData(rankings: model.Ranking[], orders: number[][], shifts: any[], context: IRenderContext<any>): IRankingData[] {
    return rankings.map((r, i) => {
      const cols = r.children.filter((d) => !d.isHidden());
      const s = shifts[i];
      const order = orders[i];
      const colData = cols.map((c, j) => ({
        column: c,
        renderer: context.renderer(c),
        shift: s.shifts[j]
      }));
      return {
        id: r.id,
        ranking: r,
        order: order,
        shift: s.shift,
        width: s.width,
        //compute frozen columns just for the first one
        frozen: i === 0 ? colData.slice(0,this.options.freezeCols) : [],
        columns: i === 0 ? colData.slice(this.options.freezeCols) : colData,
        data: this.data.view(order).then((data) => data.map((v, i) => ({v: v, dataIndex: order[i]})))
      };
    });
  }

  select(dataIndex: number, additional = false) {
    return this.data.toggleSelection(dataIndex, additional);
  }

  drawSelection() {
    //hook
  }

  mouseOver(dataIndex: number, hover = true) {
    this.fire('hoverChanged', hover ? dataIndex : -1);
  }


  updateFreeze(left: number) {
    //hook
  }

  /**
   * render the body
   */
  /**
   * render the body
   */
  update() {
    const rankings = this.data.getRankings();
    const maxElems = d3.max(rankings, (d) => d.getOrder().length) || 0;
    const height = this.options.rowHeight * maxElems;
    const visibleRange = this.slicer(0, maxElems, (i) => i * this.options.rowHeight);
    const orderSlicer = (order: number[]) => {
      if (visibleRange.from === 0 && order.length <= visibleRange.to) {
        return order;
      }
      return order.slice(visibleRange.from, Math.min(order.length, visibleRange.to));
    };
    const orders = rankings.map((r) => orderSlicer(r.getOrder()));

    //compute offsets and shifts for individual rankings and columns inside the rankings
    var offset = 0,
      shifts = rankings.map((d, i) => {
        var r = offset;
        offset += this.options.slopeWidth;
        var o2 = 0,
          shift2 = d.children.filter((d) => !d.isHidden()).map((o) => {
            var r = o2;
            o2 += (o.getCompressed() ? model.Column.COMPRESSED_WIDTH : o.getWidth()) + this.options.columnPadding;
            if (model.isMultiLevelColumn(o) && !(<model.IMultiLevelColumn>o).getCollapsed() && !o.getCompressed()) {
              o2 += this.options.columnPadding * ((<model.IMultiLevelColumn>o).length - 1);
            }
            return r;
          });
        offset += o2;
        return {
          shift: r,
          shifts: shift2,
          width: o2
        };
      });

    const context = this.createContextImpl(visibleRange.from);
    const data = this.createData(rankings, orders, shifts, context);
    this.updateImpl(data, context, offset, height);
  }

  protected createContextImpl(index_shift: number): IBodyRenderContext {
    return null; //hook
  }

  protected updateImpl(data: IRankingData[], context: IBodyRenderContext, offset: number, height: number) {
    // hook
  }
}


export class ABodyDOMRenderer extends ABodyRenderer {

  protected currentFreezeLeft = 0;

  constructor(data: provider.DataProvider, parent: Element, slicer: ISlicer, private domMapping: IDOMMapping, options = {}) {
    super(data, parent, slicer, domMapping.root, options);
  }

  renderRankings($body: d3.Selection<any>, data: IRankingData[], context: IBodyRenderContext&IDOMRenderContext, height: number) {
    const that = this;
    const domMapping = this.domMapping;
    const g = this.domMapping.g;

    const $rankings = $body.selectAll(g + '.ranking').data(data, (d) => d.id);
    const $rankings_enter = $rankings.enter().append(g)
      .attr('class', 'ranking')
      .call(domMapping.transform, (d) => [d.shift, 0]);
    $rankings_enter.append(g).attr('class', 'rows');
    $rankings_enter.append(g).attr('class', 'meanlines').attr('clip-path', `url(#c${this.options.idPrefix}Freeze)`);

    //animated shift
    this.animated($rankings).call(domMapping.transform, (d, i) => [d.shift, 0]);

    {
      let $rows = $rankings.select(g + '.rows').selectAll(g + '.row').data((d) => d.order, String);
      let $rows_enter = $rows.enter().append(g).attr('class', 'row');
      $rows_enter.call(domMapping.transform, (d, i) => [0, context.cellPrevY(i)]);

      $rows_enter.append(domMapping.bg).attr('class', 'bg');
      $rows_enter
        .on('mouseenter', (d) => this.mouseOver(d, true))
        .on('mouseleave', (d) => this.mouseOver(d, false))
        .on('click', (d) => this.select(d, d3.event.ctrlKey));

      //create templates
      function createTemplates(node: HTMLElement|SVGGElement, columns: IRankingColumnData[]) {
        renderer.matchColumns(node, columns);
        //set transform
        columns.forEach((col, ci) => {
          const cnode: any = node.childNodes[ci];
          domMapping.translate(cnode, col.shift, 0);
        });
      }

      $rows_enter.append(g).attr('class', 'cols').attr('clip-path', `url(#c${this.options.idPrefix}Freeze)`).each(function (d, i, j) {
        createTemplates(this, data[j].columns);
      });

      $rows_enter.append(g).attr('class', 'frozen').call(this.domMapping.transform,() => [this.currentFreezeLeft, 0]).each(function (d, i, j) {
        createTemplates(this, data[j].frozen);
      });

      $rows
        .attr('data-data-index', (d) => d)
        .classed('selected', (d) => this.data.isSelected(d));
      //.classed('highlighted', (d) => this.data.isHighlighted(d.d));

      //animated reordering
      this.animated($rows).call(domMapping.transform, (d, i) => [0, context.cellY(i)]);

      //update background helper
      $rows.select(domMapping.bg).attr('class', (d, i) => 'bg ' + (i % 2 === 0 ? 'even' : 'odd'))
        .call(domMapping.updateBG, (d, i, j) => [data[j].width, context.rowHeight(i)]);

      function updateColumns(node: SVGGElement | HTMLElement, r: IRankingData, i: number, columns: IRankingColumnData[]) {
        //update nodes and create templates
        renderer.matchColumns(node, columns);
        r.data.then((rows) => {
          columns.forEach((col, ci) => {
            const cnode: any = node.childNodes[ci];
            domMapping.translate(cnode, col.shift, 0);
            col.renderer.update(cnode, rows[i], i);
          });
        });
      }
      //update columns

      $rows.select(g + '.cols').each(function (d, i, j) {
        updateColumns(this, data[j], i, data[j].columns);
      });
      $rows.select(g + '.frozen').each(function (d, i, j) {
        updateColumns(this, data[j], i, data[j].frozen);
      });
      $rows.exit().remove();
    }

    {
      let $meanlines = $rankings.select(g + '.meanlines').selectAll(domMapping.meanLine + '.meanline').data((d) => d.columns.filter((c) => this.showMeanLine(c.column)));
      $meanlines.enter().append(domMapping.meanLine).attr('class', 'meanline');
      $meanlines.each(function (d, i, j) {
        const h = that.histCache.get(d.column.id);
        const $mean = d3.select(this);
        if (!h) {
          return;
        }
        h.then((stats: model.IStatistics) => {
          const x_pos = d.shift + d.column.getWidth() * stats.mean;
          domMapping.updateMeanLine($mean, isNaN(x_pos) ? 0 : x_pos, height);
        });
      });
      $meanlines.exit().remove();
    }

    $rankings.exit().remove();
  }

  select(dataIndex: number, additional = false) {
    var selected = super.select(dataIndex, additional);
    this.$node.selectAll(`[data-data-index="${dataIndex}"`).classed('selected', selected);
    return selected;
  }

  drawSelection() {
    const indices = this.data.getSelection();

    forEach(this.node, '.selected', (d) => d.classList.remove('selected'));
    if (indices.length === 0) {
      return;
    } else {
      let q = indices.map((d) => `[data-data-index="${d}"]`).join(',');
      forEach(this.node, q, (d) => d.classList.add('selected'));
    }
  }

  mouseOver(dataIndex: number, hover = true) {
    super.mouseOver(dataIndex, hover);

    function setClass(item: Element) {
      item.classList.add('hover');
    }

    forEach(this.node, '.hover', (d) => d.classList.remove('hover'));
    if (hover) {
      forEach(this.node, `[data-data-index="${dataIndex}"]`, setClass);
    }
  }

  renderSlopeGraphs($parent: d3.Selection<any>, data: IRankingData[], context: IBodyRenderContext&IDOMRenderContext, height: number) {
    const slopes = data.slice(1).map((d, i) => ({left: data[i].order, left_i: i, right: d.order, right_i: i + 1}));

    const $slopes = $parent.selectAll(this.domMapping.slopes + '.slopegraph').data(slopes);
    $slopes.enter().append(this.domMapping.slopes).attr('class', 'slopegraph');
    //$slopes.attr('transform', (d, i) => `translate(${(shifts[i + 1].shift - this.options.slopeWidth)},0)`);
    $slopes.call(this.domMapping.updateSlopes, this.options.slopeWidth, height, (d, i) => ((data[i + 1].shift - this.options.slopeWidth)));

    const $lines = $slopes.selectAll('line.slope').data((d) => {
      var cache = {};
      d.right.forEach((data_index, pos) => cache[data_index] = pos);
      return d.left.map((data_index, pos) => ({
        data_index: data_index,
        lpos: pos,
        rpos: cache[data_index]
      })).filter((d) => d.rpos != null);
    });
    $lines.enter().append('line').attr({
      'class': 'slope',
      x2: this.options.slopeWidth
    }).on('mouseenter', (d) => this.mouseOver(d.data_index, true))
      .on('mouseleave', (d) => this.mouseOver(d.data_index, false));
    $lines.attr('data-data-index', (d) => d.data_index);
    $lines.attr({
      y1: (d: any) => context.rowHeight(d.lpos) * 0.5 + context.cellY(d.lpos),
      y2: (d: any) => context.rowHeight(d.rpos) * 0.5 + context.cellY(d.rpos)
    });
    $lines.exit().remove();

    $slopes.exit().remove();
  }

  updateFreeze(left: number) {
    forEach(this.node, this.domMapping.g+'.row .frozen', (row: SVGElement | HTMLElement) => {
      this.domMapping.translate(row, left, 0);
    });
    this.domMapping.translate(<SVGElement>this.node.querySelector(`clipPath#c${this.options.idPrefix}Freeze`), left, 0);
    this.currentFreezeLeft = left;
  }

  updateClipPaths(data : IRankingData[], context: IBodyRenderContext&IDOMRenderContext, height: number) {
    //no clip paths in HTML
  }

  protected createContextImpl(index_shift: number): IBodyRenderContext {
    return this.createContext(index_shift, this.domMapping.creator);
  }

  protected updateImpl(data: IRankingData[], context: IBodyRenderContext, offset: number, height: number) {
    // - ... added one to often
    this.domMapping.setSize(this.node, Math.max(0, offset - this.options.slopeWidth), height);

    var $body = this.$node.select(this.domMapping.g + '.body');
    if ($body.empty()) {
      $body = this.$node.append(this.domMapping.g).classed('body', true);
    }

    this.renderSlopeGraphs($body, data, context, height);
    this.renderRankings($body, data, context, height);

    this.updateClipPaths(data, context, height);
  }
}


export class BodySVGRenderer extends ABodyDOMRenderer {
  constructor(data: provider.DataProvider, parent: Element, slicer: ISlicer, options = {}) {
    super(data, parent, slicer, domMappings.svg, options);
  }

  updateClipPathsImpl(r: model.Column[], context: IBodyRenderContext&IDOMRenderContext, height: number) {
    var $base = this.$node.select('defs.body');
    if ($base.empty()) {
      $base = this.$node.append('defs').classed('body', true);
    }

    //generate clip paths for the text columns to avoid text overflow
    //see http://stackoverflow.com/questions/L742812/cannot-select-svg-foreignobject-element-in-d3
    //there is a bug in webkit which present camelCase selectors
    const textClipPath = $base.selectAll(function () {
      return this.getElementsByTagName('clipPath');
    }).data(r, (d) => d.id);
    textClipPath.enter().append('clipPath')
      .attr('id', (d) => `${context.idPrefix}clipCol${d.id}`)
      .append('rect').attr('y', 0);
    textClipPath.exit().remove();
    textClipPath.select('rect')
      .attr({
        x: 0, //(d,i) => offsets[i],
        width: (d) => Math.max(d.getWidth() - 5, 0),
        height: height
      });
  }

  updateClipPaths(data : IRankingData[], context: IBodyRenderContext&IDOMRenderContext, height: number) {
    var shifts = [], offset = 0;
    data.forEach((r) => {
      const w = r.ranking.flatten(shifts, offset, 2, this.options.columnPadding);
      offset += w + this.options.slopeWidth;
    });
    this.updateClipPathsImpl(shifts.map(s => s.col), context, height);

    { //update frozen clip-path
      let $elem = this.$node.select(`clipPath#c${context.idPrefix}Freeze`);
      if ($elem.empty()) {
        $elem = this.$node.append('clipPath').attr('id', `c${context.idPrefix}Freeze`).append('rect').attr({
          y: 0,
          width: 20000,
          height: height
        });
      }

      const maxColumn = data.length === 0 ? 0 : d3.max(data[0].frozen, (f) => f.shift + f.column.getWidth());
      $elem.select('rect').attr({
        x: maxColumn,
        height: height,
        transform: `translate(${this.currentFreezeLeft},0)`
      });
    }
  }
}

export class BodyHTMLRenderer extends ABodyDOMRenderer {
  constructor(data: provider.DataProvider, parent: Element, slicer: ISlicer, options = {}) {
    super(data, parent, slicer, domMappings.html, options);
  }
}

export class BodyCanvasRenderer extends ABodyRenderer {
  static CUSTOM_OPTIONS = {
    style: {
      text: 'black',
      font: '10pt "Helvetica Neue", Helvetica, Arial, sans-serif',
      slope: 'darkgray',
      link: 'blue',
      selection: '#ffa500',
      hover: '#e5e5e5',
      bg: '#f7f7f7',
    },
    current: {
      hovered: -1
    }
  };

  private lastShifts: {column: model.Column; shift: number}[] = [];

  constructor(data: provider.DataProvider, parent: Element, slicer: ISlicer, options = {}) {
    super(data, parent, slicer, 'canvas', utils.merge({}, BodyCanvasRenderer.CUSTOM_OPTIONS, options));

    this.initInteraction();
  }

  private columnUnderMouse(x: number) {
    for(let shift of this.lastShifts) {
      if (shift.shift <= x && x < (shift.shift + shift.column.getWidth())) {
        return shift.column;
      }
    }
    return null;
  }
  private rowUnderMouse(y: number) {
    const rowHeight =this.options.rowHeight;
    return Math.round((y + rowHeight*0.25)/rowHeight);
  }

  private itemUnderMouse(xy: [number, number]) {
    const row = this.rowUnderMouse(xy[1]);
    if (row < 0) {
      return null;
    }
    const col = this.columnUnderMouse(xy[0]);
    if (col === null) {
      return null;
    }
    const order = col.findMyRanker().getOrder();
    return {
      dataIndex: order[row],
      column: col
    };
  }

  private initInteraction() {
    this.$node.on('selectstart', () => d3.event.preventDefault());

    this.$node.on('mousemove', () => {
      const mouse = d3.mouse(this.node);
      const pos = this.itemUnderMouse(mouse);
      this.mouseOver(pos ? pos.dataIndex : -1);
    });
    this.$node.on('click', () => {
      const mouse = d3.mouse(this.node);
      const pos = this.itemUnderMouse(mouse);
      if (pos) {
        //additional if click on Selection Column
        this.select(pos.dataIndex, d3.event.ctrlKey || pos.column instanceof model.SelectionColumn);
      }
    });
  }

  /**
   * get a style
   */
  private style(name: string) {
    const o: any = this.options;
    return (o.style || {})[name];
  }

  select(dataIndex: number, additional = false) {
    var selected = super.select(dataIndex, additional);
    this.update();
    return selected;
  }

  drawSelection() {
    this.update(); //no shortcut so far
  }

  mouseOver(dataIndex: number, hover = true) {
    const o: any = this.options;
    if (o.current.hovered === dataIndex) {
      return;
    }
    o.current.hovered = dataIndex;
    super.mouseOver(dataIndex, dataIndex >= 0);
    this.update();
  }

  private isHovered(dataIndex: number) {
    const o: any = this.options;
    return o.current.hovered === dataIndex;
  }

  renderRankings(ctx: CanvasRenderingContext2D, data: IRankingData[], context: IBodyRenderContext&ICanvasRenderContext, height: number) {
    ctx.save();

    data.forEach((ranking) => {
      ranking.data.then((data) => {
        ctx.save();
        ctx.translate(ranking.shift, 0);

        ranking.order.forEach((dataIndex, i) => {
          const di = data[i];
          ctx.translate(0, context.cellY(i));
          if (i % 2 === 0) {
            ctx.fillStyle = this.style('bg');
            ctx.fillRect(0, 0, ranking.width, context.rowHeight(i));
            ctx.fillStyle = this.style('text');
          }
          const isSelected = this.data.isSelected(dataIndex);
          if (isSelected) {
            ctx.strokeStyle = this.style('selection');
            ctx.strokeRect(0, 0, ranking.width, context.rowHeight(i));
          } else if (this.isHovered(dataIndex)) {
            ctx.strokeStyle = this.style('hover');
            ctx.strokeRect(0, 0, ranking.width, context.rowHeight(i));
          }

          ranking.columns.forEach((child) => {
            ctx.save();
            ctx.translate(child.shift, 0);
            child.renderer(ctx, di, i, context);
            ctx.restore();
          });
          ctx.translate(0, -context.cellY(i));
        });

        ctx.restore();
      });
    });
    ctx.restore();
  }

  renderSlopeGraphs(ctx: CanvasRenderingContext2D, data: IRankingData[], context: IBodyRenderContext&ICanvasRenderContext) {
    var slopes = data.slice(1).map((d, i) => ({left: data[i].order, left_i: i, right: d.order, right_i: i + 1}));
    ctx.save();
    ctx.strokeStyle = this.style('slope');
    slopes.forEach((slope, i) => {
      ctx.save();
      ctx.translate(data[i + 1].shift - this.options.slopeWidth, 0);

      var cache = {};
      slope.right.forEach((data_index, pos) => {
        cache[data_index] = pos;
      });
      const lines = slope.left.map((data_index, pos) => ({
        data_index: data_index,
        lpos: pos,
        rpos: cache[data_index]
      })).filter((d) => d.rpos != null);


      lines.forEach((line) => {
        const isSelected = this.data.isSelected(line.data_index);
        const isHovered = this.isHovered(line.data_index);
        if (isSelected) {
          ctx.strokeStyle = this.style('selection');
        } else if (isHovered) {
          ctx.strokeStyle = this.style('hover');
        }
        ctx.beginPath();
        ctx.moveTo(0, context.rowHeight(line.lpos) * 0.5 + context.cellY(line.lpos));
        ctx.lineTo(this.options.slopeWidth, context.rowHeight(line.rpos) * 0.5 + context.cellY(line.rpos));
        ctx.stroke();
        if (isSelected || isHovered) {
          ctx.strokeStyle = this.style('slope');
        }

      });

      ctx.restore();
    });
    ctx.restore();
  }


  protected createContextImpl(index_shift: number): IBodyRenderContext {
    return this.createContext(index_shift, renderer.createCanvas);
  }

  private static computeShifts(data:IRankingData[]) {
    var r = [];
    data.forEach((d) => {
      const base = d.shift;
      r.push(...d.columns.map((c) => ({column: c.column, shift: c.shift+base})));
    });
    return r;
  }

  protected updateImpl(data: IRankingData[], context: IBodyRenderContext, offset: number, height: number) {
    // - ... added one to often
    this.$node.attr({
      width: Math.max(0, offset - this.options.slopeWidth),
      height: height
    });

    this.lastShifts = BodyCanvasRenderer.computeShifts(data);


    const ctx = (<HTMLCanvasElement>this.$node.node()).getContext('2d');
    ctx.font = this.style('font');
    ctx.textBaseline = 'top';
    ctx.fillStyle = this.style('text');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    this.renderSlopeGraphs(ctx, data, context);
    this.renderRankings(ctx, data, context, height);
  }
}

export function createBodyRenderer(type = 'svg', data: provider.DataProvider, parent: Element, slicer: ISlicer, options = {}): IBodyRenderer {
  switch (type) {
    case 'svg':
      return new BodySVGRenderer(data, parent, slicer, options);
    case 'html':
      return new BodyHTMLRenderer(data, parent, slicer, options);
    case 'canvas':
      return new BodyCanvasRenderer(data, parent, slicer, options);
    default:
      return new BodySVGRenderer(data, parent, slicer, options);
  };
}
