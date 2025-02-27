// Licensed to Cloudera, Inc. under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  Cloudera, Inc. licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import ko from 'knockout';

import 'ko/bindings/ko.publish';

import componentUtils from 'ko/components/componentUtils';
import { EXECUTABLE_UPDATED_EVENT } from 'apps/notebook2/execution/executable';
import DisposableComponent from 'ko/components/DisposableComponent';
import I18n from 'utils/i18n';
import { RESULT_UPDATED_EVENT } from 'apps/notebook2/execution/executionResult';
import { LOGS_UPDATED_EVENT } from 'apps/notebook2/execution/executionLogs';

export const NAME = 'executable-logs';

// prettier-ignore
const TEMPLATE = `
<div class="snippet-error-container alert alert-error" data-bind="visible: errors().length" style="display: none;">
  <ul class="unstyled" data-bind="foreach: errors">
    <li data-bind="text: $data"></li>
  </ul>
</div>

<div class="snippet-log-container margin-bottom-10" data-bind="visible: showLogs" style="display: none;">
  <div data-bind="delayedOverflow: 'slow', css: resultsKlass" style="margin-top: 5px; position: relative;">
    <a href="javascript: void(0)" class="inactive-action close-logs-overlay" data-bind="toggle: showLogs">&times;</a>
    <ul data-bind="visible: jobs().length, foreach: jobs" class="unstyled jobs-overlay">
      <li data-bind="attr: { 'id': name.substr(4) }">
        <a class="pointer" data-bind="
            text: $.trim(name),
            click: function() {
              huePubSub.publish('show.jobs.panel', {
                id: name,
                interface: $parent.sourceType() == 'impala' ? 'queries' : 'jobs',
                compute: $parent.compute
              });
            },
            clickBubble: false
          "></a>
        <!-- ko if: percentJob >= 0 -->
        <div class="progress-job progress pull-left" style="background-color: #FFF; width: 100%" data-bind="
            css: {
              'progress-warning': percentJob < 100,
              'progress-success': percentJob === 100
            }">
          <div class="bar" data-bind="style: { 'width': percentJob + '%' }"></div>
        </div>
        <!-- /ko -->
        <div class="clearfix"></div>
      </li>
    </ul>
    <span data-bind="visible: !isPresentationMode() || !isHidingCode()">
    <pre data-bind="visible: !logs() && jobs().length" class="logs logs-bigger">${ I18n('No logs available at this moment.') }</pre>
    <pre data-bind="visible: logs, text: logs, logScroller: logs, logScrollerVisibilityEvent: showLogs" class="logs logs-bigger logs-populated"></pre>
  </span>
  </div>
  <div class="snippet-log-resizer" data-bind="
      visible: logs,
      logResizer: {
        parent: '.snippet-log-container',
        target: '.logs-populated',
        mainScrollable: window.MAIN_SCROLLABLE,
        onStart: function () { huePubSub.publish('result.grid.hide.fixed.headers') },
        onResize: function() {
          huePubSub.publish('result.grid.hide.fixed.headers');
          window.setTimeout(function () {
            huePubSub.publish('result.grid.redraw.fixed.headers');
          }, 500);
        },
        minHeight: 50
      }
    ">
    <i class="fa fa-ellipsis-h"></i>
  </div>
</div>
<div class="snippet-log-container margin-bottom-10">
  <div data-bind="visible: !hasResultset() && status() == 'available' && fetchedOnce(), css: resultsKlass" style="display:none;">
    <pre class="margin-top-10 no-margin-bottom"><i class="fa fa-check muted"></i> ${ I18n('Success.') }</pre>
  </div>

  <div data-bind="visible: hasResultset() && status() === 'available' && hasEmptyResult() && fetchedOnce() && !explanation().length, css: resultsKlass" style="display:none;">
    <pre class="margin-top-10 no-margin-bottom"><i class="fa fa-check muted"></i> ${ I18n("Done. 0 results.") }</pre>
  </div>

  <div data-bind="visible: status() === 'expired', css: resultsKlass" style="display:none;">
    <pre class="margin-top-10 no-margin-bottom"><i class="fa fa-check muted"></i> ${ I18n("Results have expired, rerun the query if needed.") }</pre>
  </div>

  <div data-bind="visible: status() === 'available' && !fetchedOnce(), css: resultsKlass" style="display:none;">
    <pre class="margin-top-10 no-margin-bottom"><i class="fa fa-spin fa-spinner"></i> ${ I18n('Loading...') }</pre>
  </div>
</div>
`;

class ExecutableLogs extends DisposableComponent {
  constructor(params) {
    super();

    this.activeExecutable = params.activeExecutable;
    this.showLogs = params.showLogs;
    this.resultsKlass = params.resultsKlass;
    this.isPresentationMode = params.isPresentationMode;
    this.isHidingCode = params.isHidingCode;
    this.explanation = params.explanation;

    this.status = ko.observable();
    this.fetchedOnce = ko.observable();
    this.hasResultset = ko.observable();
    this.hasEmptyResult = ko.observable();
    this.sourceType = ko.observable();
    this.compute = undefined;

    this.jobs = ko.observableArray();
    this.errors = ko.observableArray();
    this.logs = ko.observable();

    this.subscribe(EXECUTABLE_UPDATED_EVENT, executable => {
      if (this.activeExecutable() === executable) {
        this.updateFromExecutable(executable);
      }
    });

    this.subscribe(this.activeExecutable, this.updateFromExecutable.bind(this));

    this.subscribe(RESULT_UPDATED_EVENT, executionResult => {
      if (this.activeExecutable() === executionResult.executable) {
        this.updateFromResult(executionResult);
      }
    });

    this.subscribe(LOGS_UPDATED_EVENT, executionLogs => {
      if (this.activeExecutable() === executionLogs.executable) {
        this.updateFromLogs(executionLogs);
      }
    });
  }

  updateFromExecutable(executable) {
    this.hasResultset(executable.handle.has_result_set);
    this.status(executable.status);
    this.sourceType(executable.sourceType);
    if (!this.compute) {
      this.compute = executable.compute;
    }
    if (executable.result) {
      this.updateFromResult(executable.result);
    }
    this.updateFromLogs(executable.logs);
  }

  updateFromLogs(executionLogs) {
    this.logs(executionLogs.fullLog);
    this.jobs(executionLogs.jobs);
    this.errors(executionLogs.errors);
  }

  updateFromResult(executionResult) {
    this.fetchedOnce(executionResult.fetchedOnce);
    this.hasEmptyResult(executionResult.rows.length === 0);
  }
}

componentUtils.registerComponent(NAME, ExecutableLogs, TEMPLATE);
