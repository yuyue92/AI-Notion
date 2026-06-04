function approvals(){
  return appShell(`
    ${pageHead(
      'Approval Inbox',
      'Review and approve submitted timesheets.',
      `<button class="btn primary" onclick="go('approval-detail')">Review Timesheet →</button>`
    )}

    <div class="card">
      <div style="display:flex;gap:10px">
        <span class="status pending">Pending Approval 12</span>
        <span class="status approved">Approved</span>
        <span class="status rejected">Rejected</span>
      </div>

      <br/>

      <div class="grid four">
        <div class="field period-filter">
          <label>Period</label>
          <div class="date-range-control">
            <input
              class="input"
              id="approval-period-start"
              type="date"
              value="2026-06-01"
              max="2026-06-07"
              onchange="syncApprovalPeriod('start')"
            />
            <span class="date-range-separator">to</span>
            <input
              class="input"
              id="approval-period-end"
              type="date"
              value="2026-06-07"
              min="2026-06-01"
              onchange="syncApprovalPeriod('end')"
            />
          </div>
          <div class="hint">Select a start date and an end date.</div>
        </div>

        <div class="field">
          <label>Department</label>
          <select class="select">
            <option>All Departments</option>
            <option>Application Development</option>
            <option>QA Team</option>
          </select>
        </div>

        <div class="field">
          <label>Employee</label>
          <input class="input" placeholder="Search employee..."/>
        </div>

        <div class="field">
          <label>&nbsp;</label>
          <button class="btn primary" style="width:100%;justify-content:center">
            Search
          </button>
        </div>
      </div>

      <br/>

      <table>
        <thead>
          <tr>
            <th>☐</th>
            <th>Employee</th>
            <th>Department</th>
            <th>Period</th>
            <th class="num">Hours</th>
            <th>Submitted</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr onclick="go('approval-detail')">
            <td>☐</td>
            <td>Chris Wong</td>
            <td>App Development</td>
            <td>01 Jun - 07 Jun</td>
            <td class="num">38.5</td>
            <td>08 Jun 09:20</td>
            <td><span class="status pending">Pending L1</span></td>
          </tr>
          <tr onclick="go('approval-detail')">
            <td>☐</td>
            <td>Amy Lau</td>
            <td>App Development</td>
            <td>01 Jun - 07 Jun</td>
            <td class="num">40.0</td>
            <td>08 Jun 09:42</td>
            <td><span class="status pending">Pending L1</span></td>
          </tr>
          <tr onclick="go('approval-detail')">
            <td>☐</td>
            <td>Jason Ho</td>
            <td>QA Team</td>
            <td>01 Jun - 07 Jun</td>
            <td class="num">42.0</td>
            <td>08 Jun 10:15</td>
            <td><span class="status pending">Pending L1</span></td>
          </tr>
        </tbody>
      </table>

      <br/>

      <div style="display:flex">
        <b>Selected: 0</b>
        <div class="spacer"></div>
        <button class="btn">Approve Selected</button>
        <button class="btn primary" onclick="go('approval-detail')">
          Review Timesheet →
        </button>
      </div>
    </div>
  `);
}

function syncApprovalPeriod(changedField){
  const startInput = document.getElementById('approval-period-start');
  const endInput = document.getElementById('approval-period-end');

  if (!startInput || !endInput || !startInput.value || !endInput.value) return;

  if (startInput.value > endInput.value) {
    if (changedField === 'start') {
      endInput.value = startInput.value;
    } else {
      startInput.value = endInput.value;
    }
  }

  startInput.max = endInput.value;
  endInput.min = startInput.value;
}
