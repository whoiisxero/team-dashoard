/* A self-contained tour: fictional content only, with no workspace data or API client. */
window.createQuestPreview=()=>{
  const node=(tag,text='',cls='')=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
  const view=node('section','','view quest-preview');view.id='questPreview';
  view.innerHTML=`
    <header class="quest-preview-hero">
      <div class="eyebrow">Quest / Take a look around</div>
      <div class="quest-preview-heading"><h1>Explore Quest</h1><span class="quest-preview-badge">SAMPLE WORKSPACE</span></div>
      <p>A little inspiration for how your work can come together. Explore the dashboard, daily planning and creative tools.</p>
      <p class="quest-preview-disclosure">Everything below is fictional demo content. Real projects, people, conversations and business information stay private.</p>
    </header>
    <div class="quest-preview-switcher" role="group" aria-label="Explore demo sections">
      <button type="button" class="button" data-preview-tab="overview" aria-pressed="true" aria-controls="questPreviewOverview">🧭 Dashboard</button>
      <button type="button" class="button" data-preview-tab="planner" aria-pressed="false" aria-controls="questPreviewPlanner">🗓️ Daily planning</button>
      <button type="button" class="button" data-preview-tab="tools" aria-pressed="false" aria-controls="questPreviewTools">✨ Creative tools</button>
    </div>
    <section id="questPreviewOverview" data-preview-panel="overview" aria-labelledby="questPreviewDashboardTitle">
      <div class="quest-preview-section-title"><div><div class="eyebrow">Your work, at a glance</div><h2 id="questPreviewDashboardTitle">A space for the bigger picture</h2></div><span class="quest-preview-sample">Sample dashboard</span></div>
      <div class="quest-preview-stats">
        <div class="stat"><div class="stat-label">Sample projects</div><div class="stat-value">3</div><small>Ideas taking shape</small></div>
        <div class="stat"><div class="stat-label">Sample open tasks</div><div class="stat-value">8</div><small>One step at a time</small></div>
        <div class="stat"><div class="stat-label">Sample events today</div><div class="stat-value">2</div><small>Time to connect</small></div>
      </div>
      <div class="quest-preview-columns">
        <section class="card"><h3>Sample project spaces</h3><p class="quest-preview-muted">Each space brings its work together. These demo cards are locked.</p>
          <div class="quest-preview-project"><span class="quest-preview-mark" aria-hidden="true">A</span><div><strong>Aurora Studio</strong><small>Brand concept · Sample</small></div><button type="button" class="button" disabled aria-label="Aurora Studio: locked demo workspace">🔒 Locked</button></div>
          <div class="quest-preview-project"><span class="quest-preview-mark quest-preview-lilac" aria-hidden="true">S</span><div><strong>Summer Collection</strong><small>Creative launch · Sample</small></div><button type="button" class="button" disabled aria-label="Summer Collection: locked demo workspace">🔒 Locked</button></div>
          <div class="quest-preview-project"><span class="quest-preview-mark quest-preview-peach" aria-hidden="true">G</span><div><strong>Garden Sessions</strong><small>Event planning · Sample</small></div><button type="button" class="button" disabled aria-label="Garden Sessions: locked demo workspace">🔒 Locked</button></div>
        </section>
        <section class="card"><h3>Small steps. Real momentum.</h3><p class="quest-preview-muted">An example of priorities and progress in one place.</p>
          <ul class="quest-preview-list"><li><span class="quest-preview-dot" aria-hidden="true"></span><div><strong>Choose a visual direction</strong><small>Sample task · In progress</small></div><span class="quest-preview-chip">Priority</span></li><li><span class="quest-preview-dot" aria-hidden="true"></span><div><strong>Prepare a launch checklist</strong><small>Sample task · To do</small></div></li><li><span aria-hidden="true">✓</span><div><strong>Collect initial ideas</strong><small>Sample task · Complete</small></div></li></ul>
          <div class="quest-preview-progress-label"><span>Sample launch progress</span><strong>68%</strong></div><progress class="quest-preview-progress" value="68" max="100" aria-label="Sample launch progress">68%</progress>
        </section>
      </div>
    </section>
    <section id="questPreviewPlanner" data-preview-panel="planner" aria-labelledby="questPreviewPlanTitle" hidden>
      <div class="quest-preview-section-title"><div><div class="eyebrow">Make room for what matters</div><h2 id="questPreviewPlanTitle">A calmer kind of workday</h2></div><span class="quest-preview-sample">Sample schedule</span></div>
      <div class="quest-preview-columns"><section class="card"><h3>A sample day</h3><p class="quest-preview-muted">Illustrative times · Africa/Johannesburg</p><ol class="quest-preview-list"><li><time>09:00</time><div><strong>Plan the next steps</strong><small>Sample focus time · 30 minutes</small></div></li><li><time>11:00</time><div><strong>Creative review</strong><small>Sample meeting · 45 minutes</small></div></li><li><time>15:00</time><div><strong>Close the loop</strong><small>Sample follow-up · 20 minutes</small></div></li></ol></section>
      <section class="card"><h3>From idea to next step</h3><ul class="quest-preview-list"><li><span aria-hidden="true">📝</span><div><strong>Capture it</strong><small>Keep ideas, notes and references close.</small></div></li><li><span aria-hidden="true">🎯</span><div><strong>Give it a plan</strong><small>Break work into tasks and calendar time.</small></div></li><li><span aria-hidden="true">🔔</span><div><strong>Stay on track</strong><small>Use in-app reminders for the work ahead.</small></div></li></ul><p class="quest-preview-muted">These examples do not create tasks, events or reminders.</p></section></div>
    </section>
    <section id="questPreviewTools" data-preview-panel="tools" aria-labelledby="questPreviewToolsTitle" hidden>
      <div class="quest-preview-section-title"><div><div class="eyebrow">Build something beautiful</div><h2 id="questPreviewToolsTitle">One home for ideas and action</h2></div><span class="quest-preview-sample">Feature tour</span></div>
      <div class="quest-preview-tool-grid"><article class="card"><span class="quest-preview-tool-icon" aria-hidden="true">🎨</span><h3>Moodboards & references</h3><p>Bring colours, imagery and visual ideas into a project’s creative space.</p><div class="quest-preview-swatches" aria-label="Example colour palette"><span></span><span></span><span></span><span></span></div></article><article class="card"><span class="quest-preview-tool-icon" aria-hidden="true">📒</span><h3>Writing & business notes</h3><p>Turn scattered thoughts into a personal notebook and clear next steps.</p></article><article class="card"><span class="quest-preview-tool-icon" aria-hidden="true">🧾</span><h3>Quotes & invoices</h3><p>Prepare client documents in your own workspace, then print or open an email draft.</p></article><article class="card"><span class="quest-preview-tool-icon" aria-hidden="true">✨</span><h3>Q, your companion</h3><p>Get help finding your way around and planning work within your account’s access.</p></article></div>
    </section>
    <footer class="quest-preview-footer"><span aria-hidden="true">🔐</span><p>This tour is separate from your private workspace. You can return to your own work using Home in the sidebar.</p></footer>`;
  const tabs=[...view.querySelectorAll('[data-preview-tab]')],panels=[...view.querySelectorAll('[data-preview-panel]')];
  const select=id=>{for(const tab of tabs)tab.setAttribute('aria-pressed',String(tab.dataset.previewTab===id));for(const panel of panels)panel.hidden=panel.dataset.previewPanel!==id;};
  for(const tab of tabs)tab.onclick=()=>select(tab.dataset.previewTab);
  document.querySelector('.content').append(view);
  const button=node('button','Explore Quest');button.type='button';button.hidden=true;button.dataset.view='questPreview';window.QuestNavigation?.decorate(button,'questPreview');
  const nav=document.querySelector('.sidebar .nav');nav.insertBefore(button,nav.querySelector('[data-view=personalSetup]'));
  // Reset only local tour state on logout; no real account data ever enters this view.
  return {reset:()=>select('overview')};
};
