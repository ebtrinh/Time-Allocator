<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#f43f5e','#06b6d4'];

  let state = { activities: [], log: [], lastDate: null, yesterday: null, portions: 6 };
  let syncStatus = '';
  let errorMessage = '';
  let newActivityName = '';
  let logInputs = {};
  let loading = true;

  // Drag state
  let dragIndex = -1;
  let dragStartX = 0;
  let dragStartRatios = [];

  $: minsLeft = getMinutesLeft();
  $: totalPortions = state.activities.reduce((s, a) => s + a.ratio, 0) || state.portions;

  function getMinutesLeft() {
    if (!browser) return 1440;
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return (midnight - now) / 60000;
  }

  function getMinutesSinceMidnight() {
    if (!browser) return 0;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function getToday() {
    return new Date().toISOString().split('T')[0];
  }

  function formatTime(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function formatClockTime(mins) {
    const h = Math.floor(mins / 60) % 12 || 12;
    const m = Math.floor(mins % 60);
    const ampm = mins < 720 ? 'am' : 'pm';
    return `${h}:${m.toString().padStart(2, '0')}${ampm}`;
  }

  function getSpentForActivity(name) {
    return state.log.filter(e => e.activity === name).reduce((s, e) => s + e.duration, 0);
  }

  function getTotalLogged() {
    return state.log.reduce((s, e) => s + e.duration, 0);
  }

  function calcRemaining(activity) {
    const totalRatio = state.activities.reduce((s, a) => s + a.ratio, 0);
    if (totalRatio === 0) return 0;

    // Calculate each activity's "remaining need" based on full day target
    const remainingNeeds = state.activities.map(a => {
      const fullDayTarget = (a.ratio / totalRatio) * 1440;
      const spent = getSpentForActivity(a.name);
      return Math.max(0, fullDayTarget - spent);
    });

    const totalRemainingNeed = remainingNeeds.reduce((s, n) => s + n, 0);
    if (totalRemainingNeed === 0) return 0;

    // This activity's remaining need
    const fullDayTarget = (activity.ratio / totalRatio) * 1440;
    const spent = getSpentForActivity(activity.name);
    const remainingNeed = Math.max(0, fullDayTarget - spent);

    // Distribute minsLeft proportionally based on remaining needs
    return (remainingNeed / totalRemainingNeed) * minsLeft;
  }

  function getActivityColor(name) {
    const activity = state.activities.find(a => a.name === name);
    return activity ? activity.color : '#64748b';
  }

  function capLogInput(name) {
    const mins = parseFloat(logInputs[name] || 0);
    if (isNaN(mins) || mins <= 0) return;

    const nowMins = getMinutesSinceMidnight();
    const lastLog = state.log[state.log.length - 1];
    const availableToLog = lastLog ? (nowMins - lastLog.endTime) : nowMins;

    if (mins > availableToLog && availableToLog > 0) {
      logInputs[name] = Math.floor(availableToLog);
    }
  }

  function showError(msg) {
    errorMessage = msg;
    setTimeout(() => errorMessage = '', 3000);
  }

  function checkDayReset() {
    const today = getToday();
    if (state.lastDate && state.lastDate !== today) {
      const totalRatio = state.activities.reduce((s, a) => s + a.ratio, 0);
      state.yesterday = {
        date: state.lastDate,
        activities: state.activities.map(a => ({
          name: a.name,
          ratio: a.ratio,
          expected: totalRatio > 0 ? (a.ratio / totalRatio) * 1440 : 0,
          spent: getSpentForActivity(a.name)
        })),
        timeline: state.log
      };
      state.log = [];
    }
    state.lastDate = today;
  }

  async function fetchState() {
    try {
      syncStatus = 'syncing';
      const res = await fetch('/api/state');
      if (res.ok) {
        state = await res.json();
        if (!state.log) state.log = [];
        if (!Array.isArray(state.log)) state.log = [];
        if (!state.portions) state.portions = 6;
        checkDayReset();
        syncStatus = 'synced';
      } else {
        syncStatus = 'error';
      }
    } catch (e) {
      console.error('Fetch error:', e);
      syncStatus = 'error';
    }
    loading = false;
  }

  async function saveState() {
    try {
      syncStatus = 'syncing';
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      syncStatus = res.ok ? 'synced' : 'error';
    } catch (e) {
      console.error('Save error:', e);
      syncStatus = 'error';
    }
  }

  async function addActivity() {
    const name = newActivityName.trim();
    if (!name) return;
    if (state.activities.find(a => a.name === name)) return;

    const color = COLORS[state.activities.length % COLORS.length];
    state.activities = [...state.activities, { name, ratio: 1, color }];
    newActivityName = '';
    await saveState();
  }

  async function removeActivity(name) {
    state.activities = state.activities.filter(a => a.name !== name);
    state.log = state.log.filter(e => e.activity !== name);
    state = state;
    await saveState();
  }

  async function logTime(name) {
    const mins = parseFloat(logInputs[name] || 0);

    if (isNaN(mins) || mins <= 0) {
      showError('Please enter a valid number of minutes');
      return;
    }

    const nowMins = getMinutesSinceMidnight();
    const lastLog = state.log[state.log.length - 1];
    const availableToLog = lastLog ? (nowMins - lastLog.endTime) : nowMins;

    if (mins > nowMins) {
      showError(`Cannot log more than ${formatTime(nowMins)} (time since midnight)`);
      return;
    }

    const cappedMins = Math.min(mins, availableToLog);
    if (cappedMins !== mins) {
      logInputs[name] = cappedMins;
    }

    const endTime = nowMins;
    state.log = [...state.log, { activity: name, duration: cappedMins, endTime }];
    logInputs[name] = '';
    await saveState();
  }

  function redistributePortions(newTotal) {
    if (state.activities.length === 0) return;
    const oldTotal = state.activities.reduce((s, a) => s + a.ratio, 0);
    if (oldTotal === newTotal) return;
    const minRequired = state.activities.length;
    if (newTotal < minRequired) return;

    let remaining = newTotal;
    state.activities.forEach((a, i) => {
      if (i === state.activities.length - 1) {
        a.ratio = remaining;
      } else {
        const proportion = a.ratio / oldTotal;
        a.ratio = Math.max(1, Math.round(proportion * newTotal));
        remaining -= a.ratio;
      }
    });
    if (state.activities[state.activities.length - 1].ratio < 1) {
      state.activities[state.activities.length - 1].ratio = 1;
    }
    state = state;
  }

  async function updatePortions(e) {
    const newPortions = parseInt(e.target.value) || 6;
    if (state.activities.length === 0) {
      state.portions = newPortions;
    } else if (newPortions >= state.activities.length) {
      redistributePortions(newPortions);
    }
    await saveState();
  }

  function startDrag(e, index) {
    e.preventDefault();
    dragIndex = index;
    dragStartX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    dragStartRatios = state.activities.map(a => a.ratio);

    if (e.type === 'touchstart') {
      window.addEventListener('touchmove', onDrag, { passive: false });
      window.addEventListener('touchend', endDrag);
    } else {
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', endDrag);
    }
  }

  async function onDrag(e) {
    if (dragIndex < 0) return;
    e.preventDefault();

    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const bar = document.getElementById('ratio-bar');
    const barRect = bar.getBoundingClientRect();
    const dx = clientX - dragStartX;
    const totalRatio = dragStartRatios.reduce((s, r) => s + r, 0);
    const pxPerRatio = barRect.width / totalRatio;
    const rawDelta = dx / pxPerRatio;
    const deltaPortions = Math.round(rawDelta);

    if (deltaPortions === 0) return;

    state.activities.forEach((a, i) => a.ratio = dragStartRatios[i]);

    if (deltaPortions > 0) {
      for (let d = 0; d < deltaPortions; d++) {
        let shrinkIdx = -1;
        for (let j = dragIndex + 1; j < state.activities.length; j++) {
          if (state.activities[j].ratio > 1) { shrinkIdx = j; break; }
        }
        if (shrinkIdx === -1) break;
        state.activities[dragIndex].ratio++;
        state.activities[shrinkIdx].ratio--;
      }
    } else {
      for (let d = 0; d < Math.abs(deltaPortions); d++) {
        let shrinkIdx = -1;
        for (let j = dragIndex; j >= 0; j--) {
          if (state.activities[j].ratio > 1) { shrinkIdx = j; break; }
        }
        if (shrinkIdx === -1) break;
        state.activities[dragIndex + 1].ratio++;
        state.activities[shrinkIdx].ratio--;
      }
    }

    state = state;
    await saveState();
  }

  function endDrag() {
    dragIndex = -1;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchmove', onDrag);
    window.removeEventListener('touchend', endDrag);
  }

  onMount(() => {
    fetchState();
    const interval = setInterval(() => {
      minsLeft = getMinutesLeft();
    }, 60000);
    return () => clearInterval(interval);
  });
</script>

<div class="container">
  <header>
    <h1>
      Daily Time Allocator
      <span class="sync-status {syncStatus}">
        {#if syncStatus === 'synced'}(synced){:else if syncStatus === 'syncing'}(syncing...){:else if syncStatus === 'error'}(offline){/if}
      </span>
    </h1>
    <div class="clock">Time left: <span>{formatTime(minsLeft)}</span></div>
  </header>

  <div class="bar-container">
    <div class="bar-header">
      <div class="bar-label">Drag dividers to adjust ratios</div>
      <div class="portions-input">
        <label>Portions:</label>
        <input type="number" value={totalPortions} min="1" max="24" on:change={updatePortions}>
      </div>
    </div>
    <div class="bar-wrapper">
      <div id="ratio-bar" class="ratio-bar" class:empty={state.activities.length === 0}>
        {#if state.activities.length === 0}
          Add activities below
        {:else}
          {#each Array(totalPortions - 1) as _, i}
            <div class="portion-line" style="left: {((i + 1) / totalPortions) * 100}%"></div>
          {/each}
          {#each state.activities as activity, i}
            <div class="segment" style="flex: {activity.ratio}; background: {activity.color}">
              <span>{activity.name}</span>
            </div>
            {#if i < state.activities.length - 1}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="divider"
                on:mousedown={(e) => startDrag(e, i)}
                on:touchstart={(e) => startDrag(e, i)}
              ></div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <div class="timeline-container">
    <div class="timeline-header">
      <div class="timeline-label">Today's Timeline</div>
    </div>
    <div class="timeline-bar">
      {#each Array(48) as _, i}
        <div class="timeline-mark {i % 2 === 0 ? 'hour' : 'half'}" style="left: {(i * 30 / 1440) * 100}%"></div>
      {/each}
      {#each state.log as entry}
        {@const startMins = entry.endTime - entry.duration}
        {@const startPct = (startMins / 1440) * 100}
        {@const widthPct = (entry.duration / 1440) * 100}
        <div
          class="timeline-block"
          style="left: {startPct}%; width: {widthPct}%; background: {getActivityColor(entry.activity)}"
          title="{entry.activity}: {formatTime(entry.duration)} ({formatClockTime(startMins)} - {formatClockTime(entry.endTime)})"
        >
          <span>{entry.activity}</span>
        </div>
      {/each}
      <div class="timeline-now" style="left: {(getMinutesSinceMidnight() / 1440) * 100}%"></div>
    </div>
    <div class="timeline-hours">
      <span>12am</span><span>3am</span><span>6am</span><span>9am</span><span>12pm</span><span>3pm</span><span>6pm</span><span>9pm</span><span>12am</span>
    </div>
  </div>

  {#if errorMessage}
    <div class="error-toast">{errorMessage}</div>
  {/if}

  <div class="add-form">
    <input
      type="text"
      placeholder="Activity name"
      bind:value={newActivityName}
      on:keypress={(e) => e.key === 'Enter' && addActivity()}
    >
    <button on:click={addActivity}>Add Activity</button>
  </div>

  <div class="grid">
    <div class="panel">
      <h2>Today's Activities</h2>
      <div class="activity-list">
        {#if loading}
          <div class="loading">Loading...</div>
        {:else if state.activities.length === 0}
          <div class="no-data">No activities yet</div>
        {:else}
          {#each state.activities as activity}
            {@const spent = getSpentForActivity(activity.name)}
            {@const remaining = calcRemaining(activity)}
            <div class="activity-row">
              <div class="color-dot" style="background: {activity.color}"></div>
              <div class="activity-info">
                <div class="activity-name">{activity.name}</div>
                <div class="activity-meta">{activity.ratio} of {totalPortions} portions</div>
              </div>
              <div class="activity-hours">
                <div class="remaining">{formatTime(remaining)}</div>
                <div class="spent">{formatTime(spent)} spent</div>
              </div>
              <input
                type="number"
                class="log-input"
                placeholder="min"
                step="1"
                min="1"
                bind:value={logInputs[activity.name]}
                on:input={() => capLogInput(activity.name)}
              >
              <button class="log-btn" on:click={() => logTime(activity.name)}>Log</button>
              <button class="del-btn" on:click={() => removeActivity(activity.name)}>&times;</button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
    <div class="panel">
      <h2>Yesterday's Summary</h2>
      {#if !state.yesterday || state.yesterday.activities.length === 0}
        <div class="no-data">No data from yesterday</div>
      {:else}
        {@const totalSpent = state.yesterday.activities.reduce((s, a) => s + a.spent, 0)}
        {@const underActivities = state.yesterday.activities.filter(a => a.spent - a.expected < -15).sort((a, b) => (a.spent - a.expected) - (b.spent - b.expected))}
        <div class="summary-total">
          Total logged: <strong>{formatTime(totalSpent)}</strong>
        </div>
        <div class="summary-list">
          {#each state.yesterday.activities as activity}
            {@const diff = activity.spent - activity.expected}
            {@const cls = diff > 5 ? 'over' : diff < -5 ? 'under' : 'neutral'}
            {@const label = diff > 5 ? `+${formatTime(diff)}` : diff < -5 ? `-${formatTime(Math.abs(diff))}` : 'on target'}
            <div class="summary-item">
              <span>{activity.name}</span>
              <span class={cls}>{formatTime(activity.spent)} ({label})</span>
            </div>
          {/each}
        </div>
        {#if underActivities.length > 0}
          <div class="summary-watch">
            <div class="watch-header">Watch today:</div>
            {#each underActivities as activity}
              <div class="watch-item">{activity.name} (was {formatTime(Math.abs(activity.spent - activity.expected))} under)</div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
