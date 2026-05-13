let activeGroups = new Set(Object.keys(GROUP_COLOURS));
let activeSites  = new Set(Object.keys(SITE_LOOKUP));
let chart = null;
let leafletMap = null;
let markers = {};

// ── MAP INIT ──────────────────────────────────────────────────────────
function initMap() {
  leafletMap = L.map('map', { zoomControl: true }).setView([55.08, -1.62], 10);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© OpenStreetMap © Carto',
    maxZoom: 18
  }).addTo(leafletMap);

  Object.entries(COORDS).forEach(([code, c]) => {
    const s = SITE_LOOKUP[code];
    if (!s) return;
    const col = GROUP_COLOURS[s.group] || '#888';
    const marker = L.circleMarker([c.lat, c.lon], {
      radius: 7,
      fillColor: col,
      color: '#fff',
      weight: 1.5,
      fillOpacity: 0.85
    }).addTo(leafletMap);

    marker.bindPopup(`
      <div class="popup-name">${s.name}</div>
      <div class="popup-group">${s.group}</div>
      <div class="popup-action" onclick="toggleSiteFromMap('${code}')">
        ${activeSites.has(code) ? '✓ Selected — click to deselect' : '+ Click to select'}
      </div>
    `);

    marker.on('click', () => {
      updatePopupAction(code, marker);
      activeSites.clear();
      activeSites.add(code);
      buildSiteList();
      updateMapMarkers();
      renderChart();
    });

    markers[code] = marker;
  });
  updateMapMarkers();
  // Boundary: white solid base + yellow dashed on top (matches GIS map style)
  L.geoJSON(CATCHMENT_BOUNDARY,{style:{color:'white',weight:3.5,opacity:0.9,fill:false,interactive:false}}).addTo(leafletMap);
  L.geoJSON(CATCHMENT_BOUNDARY,{style:{color:'#ffeb3b',weight:1.5,opacity:0.9,fill:false,dashArray:'10,6',interactive:false}}).addTo(leafletMap);
}

function updatePopupAction(code, marker) {
  marker.setPopupContent(`
    <div class="popup-name">${SITE_LOOKUP[code]?.name || code}</div>
    <div class="popup-group">${SITE_LOOKUP[code]?.group || ''}</div>
    <div class="popup-action" onclick="toggleSiteFromMap('${code}')">
      ${activeSites.has(code) ? '✓ Selected — click to deselect' : '+ Click to select'}
    </div>
  `);
}

function toggleSiteFromMap(code) {
  if (activeSites.has(code)) {
    activeSites.delete(code);
  } else {
    activeSites.add(code);
  }
  updateMapMarkers();
  buildSiteList();
  if (markers[code]) {
    updatePopupAction(code, markers[code]);
  }
}

function updateMapMarkers() {
  let shown = 0;
  Object.entries(markers).forEach(([code, marker]) => {
    const s = SITE_LOOKUP[code];
    const groupActive = s && activeGroups.has(s.group);
    const siteActive = activeSites.has(code);
    const col = GROUP_COLOURS[s?.group] || '#888';
    if (!groupActive) {
      marker.setStyle({ fillOpacity: 0, opacity: 0, interactive: false });
    } else {
      shown++;
      marker.setStyle({
        fillColor: col,
        fillOpacity: siteActive ? 0.9 : 0.2,
        color: siteActive ? '#fff' : col,
        weight: siteActive ? 1.5 : 1,
        opacity: 1,
        interactive: true,
        radius: siteActive ? 8 : 6
      });
    }
  });
  document.getElementById('map-count').textContent = `${shown} shown`;
}

function panToSite(code) {
  const c = COORDS[code];
  if (c && leafletMap) {
    leafletMap.setView([c.lat, c.lon], 13, { animate: true });
    if (markers[code]) markers[code].openPopup();
  }
}

// ── INIT CONTROLS ─────────────────────────────────────────────────────
function init() {
  // Sort params by obs count desc, min 5 obs — so default is always data-rich
  const paramCounts = {};
  DATA.forEach(r => { if(r.value > 0) paramCounts[r.param] = (paramCounts[r.param]||0)+1; });
  const params = Object.entries(paramCounts)
    .filter(([p,n]) => n >= 5)
    .sort((a,b) => b[1]-a[1])
    .map(([p]) => p);
  document.getElementById('ps').innerHTML = params.map(p=>`<option>${p}</option>`).join('');
  document.getElementById('ps').addEventListener('change', function() { populateThresholds(this.value); });
  document.getElementById('ps-x').innerHTML = params.map(p=>`<option>${p}</option>`).join('');
  // Default X to a different param
  if (params.length > 1) document.getElementById('ps-x').selectedIndex = 1;

  const gf = document.getElementById('gfilter');
  Object.keys(GROUP_COLOURS).forEach(g => {
    const el = document.createElement('div');
    el.className = 'gtag active';
    el.textContent = g;
    el.style.background = GROUP_BG[g];
    el.style.color = '#fff';
    el.style.borderColor = 'transparent';
    el.dataset.group = g;
    el.addEventListener('click', () => toggleGroup(g, el));
    gf.appendChild(el);
  });

  buildSiteList();
  initMap();
  if (params.length) populateThresholds(params[0]);
}

function toggleGroup(g, el) {
  if (activeGroups.has(g)) {
    activeGroups.delete(g);
    el.classList.remove('active');
    el.style.background = 'transparent';
    el.style.color = GROUP_BG[g];
    el.style.borderColor = GROUP_BG[g];
  } else {
    activeGroups.add(g);
    el.classList.add('active');
    el.style.background = GROUP_BG[g];
    el.style.color = '#fff';
    el.style.borderColor = 'transparent';
  }
  Object.keys(SITE_LOOKUP).forEach(code => {
    if (!activeGroups.has(SITE_LOOKUP[code].group)) activeSites.delete(code);
  });
  buildSiteList();
  updateMapMarkers();
}

function buildSiteList() {
  const sl = document.getElementById('site-list');
  sl.innerHTML = '';
  const allGroups = Object.keys(GROUP_COLOURS);

  allGroups.forEach(g => {
    if (!activeGroups.has(g)) return;
    const groupSites = Object.entries(SITE_LOOKUP)
      .filter(([c,s]) => s.group === g)
      .sort((a,b) => a[1].name.localeCompare(b[1].name));
    if (!groupSites.length) return;

    const hd = document.createElement('div');
    hd.className = 'site-group-hd';
    hd.style.color = GROUP_COLOURS[g];
    hd.style.background = GROUP_COLOURS[g] + '12';
    hd.style.display = 'flex';
    hd.style.justifyContent = 'space-between';
    hd.style.alignItems = 'center';
    const hdSpan = document.createElement('span'); hdSpan.textContent = g; hd.appendChild(hdSpan);
    const selBtn = document.createElement('button');
    selBtn.textContent = 'Select all';
    selBtn.style.cssText = 'font-family:var(--mono);font-size:.5rem;letter-spacing:.06em;background:' + GROUP_COLOURS[g] + ';color:#fff;border:none;padding:.15rem .5rem;cursor:pointer;border-radius:2px;margin-left:.4rem;flex-shrink:0;';
    selBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeSites.clear();
      Object.keys(SITE_LOOKUP).forEach(c => { if (SITE_LOOKUP[c].group === g) activeSites.add(c); });
      buildSiteList();
      updateMapMarkers();
    });
    hd.appendChild(selBtn);
    sl.appendChild(hd);

    groupSites.forEach(([code, s]) => {
      const isActive = activeSites.has(code);
      const row = document.createElement('div');
      row.className = 'site-row' + (isActive ? ' active' : '');
      row.dataset.code = code;
      row.innerHTML = `
        <div class="site-dot" style="background:${isActive ? GROUP_COLOURS[g] : 'transparent'}"></div>
        <div class="site-name">${s.name}</div>
      `;
      row.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          panToSite(code);
        } else {
          toggleSiteFromList(code, g, row);
        }
      });
      row.title = 'Click to toggle · Ctrl+click to pan map';
      sl.appendChild(row);
    });
  });
  updateSiteCount();
}

function toggleSiteFromList(code, group, row) {
  if (activeSites.has(code)) {
    activeSites.delete(code);
    row.classList.remove('active');
    row.querySelector('.site-dot').style.background = 'transparent';
  } else {
    activeSites.add(code);
    row.classList.add('active');
    row.querySelector('.site-dot').style.background = GROUP_COLOURS[group];
  }
  updateSiteCount();
  updateMapMarkers();
}

function updateSiteCount() {
  document.getElementById('site-count').textContent = `(${activeSites.size} selected)`;
}

// ── RENDER CHART ──────────────────────────────────────────────────────
function onChartTypeChange() {
  const ctype = document.getElementById('ct').value;
  document.getElementById('xy-x-cell').style.display = ctype === 'xy' ? '' : 'none';
  document.getElementById('gv').closest('.cc-cell').style.opacity = ctype === 'xy' ? '0.4' : '1';
}

function renderChart() {
  const paramY = document.getElementById('ps').value;
  const paramX = document.getElementById('ps-x').value;
  const ctype  = document.getElementById('ct').value;
  const yMin   = +document.getElementById('ym').value;
  const yMax   = +document.getElementById('yx').value;
  const gVal   = parseFloat(document.getElementById('gv').value);
  const gLbl   = document.getElementById('gl').value || 'Guideline';
  const gShow  = document.getElementById('gs').checked && !isNaN(gVal) && ctype !== 'xy';
  const logY   = document.getElementById('log-scale').checked;

  if (activeSites.size === 0) { setStatus('No sites selected.','err'); return; }

  // ── XY SCATTER MODE ───────────────────────────────────────────────
  if (ctype === 'xy') {
    if (paramX === paramY) { setStatus('X and Y parameters must be different.','err'); return; }

    // For each site, match observations by date (within ±3 days)
    const bySite = {};
    const dataX = DATA.filter(r => r.param === paramX && r.year >= yMin && r.year <= yMax && activeSites.has(r.site) && r.value > 0);
    const dataY = DATA.filter(r => r.param === paramY && r.year >= yMin && r.year <= yMax && activeSites.has(r.site) && r.value > 0);

    // Index X by site+date
    const xIdx = {};
    dataX.forEach(r => {
      const key = r.site + '|' + r.date;
      xIdx[key] = r.value;
    });

    dataY.forEach(r => {
      const key = r.site + '|' + r.date;
      if (xIdx[key] !== undefined) {
        if (!bySite[r.site]) bySite[r.site] = [];
        bySite[r.site].push({ x: xIdx[key], y: r.value, date: r.date });
      }
    });

    const nPairs = Object.values(bySite).reduce((s,v)=>s+v.length,0);
    if (!nPairs) { setStatus('No co-sampled observations found for these two parameters at selected sites.','err'); return; }

    const datasets = Object.entries(bySite).map(([code, pts]) => {
      const s = SITE_LOOKUP[code] || { name: code, group: 'Other' };
      const col = GROUP_COLOURS[s.group] || '#888';
      return {
        label: s.name,
        data: pts,
        backgroundColor: col+'99', borderColor: col,
        pointRadius: 4, pointHoverRadius: 7,
        showLine: false, borderWidth: 0
      };
    });

    if (chart) { chart.destroy(); chart = null; }
    chart = new Chart(document.getElementById('cc').getContext('2d'), {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true, animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label(c) {
          const d = new Date(c.raw.date).toLocaleDateString('en-GB');
          return `${c.dataset.label}: ${paramX}=${c.parsed.x.toFixed(3)}, ${paramY}=${c.parsed.y.toFixed(3)}  (${d})`;
        }}}},
        scales: {
          x: { type: logY ? 'logarithmic' : 'linear',
               ticks:{font:{family:'IBM Plex Mono,monospace',size:10},color:'#5a7a92'}, grid:{color:'#daeaf5'},
               title:{display:true,text:ul(paramX),font:{family:'IBM Plex Mono,monospace',size:10},color:'#5a7a92'} },
          y: { type: logY ? 'logarithmic' : 'linear',
               ticks:{font:{family:'IBM Plex Mono,monospace',size:10},color:'#5a7a92'}, grid:{color:'#daeaf5'},
               title:{display:true,text:ul(paramY),font:{family:'IBM Plex Mono,monospace',size:10},color:'#5a7a92'} }
        }
      }
    });

    const nSites = Object.keys(bySite).length;
    // Click to highlight site
    document.getElementById('cc').onclick = function(evt) {
      const pts = chart.getElementsAtEventForMode(evt, 'nearest', {intersect:true}, false);
      if (!pts.length) {
        chart.data.datasets.forEach(ds => { ds.pointRadius=4; ds.backgroundColor=ds.borderColor+'99'; });
        document.getElementById('site-label').style.display='none';
        chart.update('none'); return;
      }
      const di = pts[0].datasetIndex;
      const siteName = chart.data.datasets[di].label;
      chart.data.datasets.forEach((ds,i) => {
        ds.pointRadius    = i===di ? 7 : 2;
        ds.backgroundColor = i===di ? ds.borderColor+'dd' : ds.borderColor+'22';
      });
      const lbl = document.getElementById('site-label');
      lbl.textContent = '● ' + siteName;
      lbl.style.color = chart.data.datasets[di].borderColor;
      lbl.style.display = 'block';
      chart.update('none');
    };

    document.getElementById('ched').textContent = `${paramY} vs ${paramX}`;
    document.getElementById('cby').textContent += ` · ${UNITS[paramX]||''} vs ${UNITS[paramY]||''}`;
    document.getElementById('cby').textContent = `${nPairs.toLocaleString()} co-sampled pairs · ${nSites} sites · ${yMin}–${yMax}`;
    document.getElementById('viz').style.display = 'block';

    const yVals = Object.values(bySite).flat().map(p=>p.y).sort((a,b)=>a-b);
    const mean = (yVals.reduce((s,v)=>s+v,0)/yVals.length).toFixed(3);
    const med  = yVals[Math.floor(yVals.length/2)].toFixed(3);
    document.getElementById('ss').style.display='block';
    document.getElementById('si').innerHTML = [
      ['Pairs',nPairs.toLocaleString()],['Sites',nSites],
      [`Mean ${paramY}`,mean],[`Median ${paramY}`,med]
    ].map(([l,v])=>`<div class="sv"><div class="sl">${l}</div><div class="svv">${v}</div></div>`).join('');

    // legend
    document.getElementById('lw').style.display='block';
    const byGroup={};
    Object.entries(bySite).forEach(([code])=>{const g=(SITE_LOOKUP[code]||{}).group||'Other';if(!byGroup[g])byGroup[g]=[];byGroup[g].push(code);});
    document.getElementById('li').innerHTML=Object.entries(byGroup).map(([g,codes])=>
      `<div style="margin-bottom:.4rem;width:100%"><div style="font-family:var(--mono);font-size:.52rem;letter-spacing:.14em;text-transform:uppercase;color:${GROUP_COLOURS[g]||'#888'};margin-bottom:.2rem">${g}</div>
      <div style="display:flex;flex-wrap:wrap;gap:.25rem">${codes.map(code=>`<div class="lit" style="cursor:pointer" onclick="panToSite('${code}')" title="Pan to site on map"><div class="ld" style="background:${GROUP_COLOURS[(SITE_LOOKUP[code]||{}).group]||'#888'}"></div>${(SITE_LOOKUP[code]||{name:code}).name}</div>`).join('')}</div></div>`
    ).join('');

    document.getElementById('th').innerHTML='<tr><th>Date</th><th>Site</th><th>Group</th><th>'+paramX+'</th><th>'+paramY+'</th></tr>';
    const allPairs = Object.entries(bySite).flatMap(([code,pts])=>pts.map(p=>({code,p})));
    allPairs.sort((a,b)=>a.p.date-b.p.date);
    document.getElementById('tb2').innerHTML=allPairs.slice(0,500).map(({code,p})=>{
      const s=SITE_LOOKUP[code]||{name:code,group:''};
      return`<tr><td>${new Date(p.date).toLocaleDateString('en-GB')}</td><td>${s.name}</td><td>${s.group}</td><td>${p.x.toFixed(3)}</td><td>${p.y.toFixed(3)}</td></tr>`;
    }).join('');

    setStatus(`✓  ${nPairs.toLocaleString()} co-sampled pairs · ${nSites} sites · ${paramY} vs ${paramX}`, 'ok');
    return;
  }

  // ── TIME SERIES / DATE SCATTER MODE ──────────────────────────────
  const param = paramY;
  const filtered = DATA.filter(r =>
    r.param === param && r.year >= yMin && r.year <= yMax &&
    activeSites.has(r.site) && r.value > 0
  );
  if (!filtered.length) { setStatus('No data for current selection.','err'); return; }

  const bySite = {};
  filtered.forEach(r => { if (!bySite[r.site]) bySite[r.site]=[]; bySite[r.site].push(r); });

  const datasets = Object.entries(bySite).map(([code, pts]) => {
    const s = SITE_LOOKUP[code] || { name: code, group: 'Other' };
    const col = GROUP_COLOURS[s.group] || '#888';
    return {
      label: s.name,
      data: pts.sort((a,b)=>a.date-b.date).map(r=>({x:r.date,y:r.value})),
      backgroundColor: col+'99', borderColor: col,
      pointRadius: ctype==='scatter' ? 3 : 1.5, pointHoverRadius: 7,
      showLine: ctype==='line', borderWidth: ctype==='line' ? 1.5 : 0,
      fill: false, tension: 0.3
    };
  });

  const glPlugin = { id:'gl', afterDraw(ch) {
    if (!gShow) return;
    const {ctx,chartArea,scales} = ch; if (!scales.y) return;
    const yp = scales.y.getPixelForValue(gVal);
    if (yp < chartArea.top || yp > chartArea.bottom) return;
    ctx.save();
    ctx.strokeStyle='#c0392b'; ctx.lineWidth=1.8; ctx.setLineDash([7,5]);
    ctx.beginPath(); ctx.moveTo(chartArea.left,yp); ctx.lineTo(chartArea.right,yp); ctx.stroke();
    ctx.fillStyle='#c0392b'; ctx.font='500 11px IBM Plex Mono,monospace';
    const glUnit = UNITS[param] ? ` ${UNITS[param]}` : ''; ctx.fillText(`${gLbl}  ${gVal}${glUnit}`, chartArea.left+8, yp-6);
    ctx.restore();
  }};

  if (chart) { chart.destroy(); chart = null; }
  chart = new Chart(document.getElementById('cc').getContext('2d'), {
    type: ctype==='line' ? 'line' : 'scatter',
    data: { datasets }, plugins: [glPlugin],
    options: {
      responsive: true, animation: { duration: 400 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label(c) {
        return `${c.dataset.label}: ${c.parsed.y.toFixed(3)}  (${new Date(c.parsed.x).toLocaleDateString('en-GB')})`;
      }}}},
      scales: {
        x: { type:'linear', ticks:{font:{family:'IBM Plex Mono,monospace',size:10},color:'#5a7a92',maxTicksLimit:10,callback:v=>new Date(v).getFullYear()}, grid:{color:'#daeaf5'} },
        y: { type:logY?'logarithmic':'linear', min:logY?undefined:0, ticks:{font:{family:'IBM Plex Mono,monospace',size:10},color:'#5a7a92'}, grid:{color:'#daeaf5'}, title:{display:true,text:ul(param),font:{family:'IBM Plex Mono,monospace',size:10},color:'#5a7a92'} }
      }
    }
  });

  // Click to highlight site
  document.getElementById('cc').onclick = function(evt) {
    var pts = chart.getElementsAtEventForMode(evt,'nearest',{intersect:true},false);
    if (!pts.length) {
      chart.data.datasets.forEach(function(ds){
        ds.pointRadius = ctype==='scatter'?3:1.5;
        ds.backgroundColor = ds.borderColor+'99';
      });
      document.getElementById('site-label').style.display='none';
      chart.update('none'); return;
    }
    var di = pts[0].datasetIndex;
    var nm = chart.data.datasets[di].label;
    chart.data.datasets.forEach(function(ds,i){
      ds.pointRadius = i===di?6:(ctype==='scatter'?2:1);
      ds.backgroundColor = i===di?ds.borderColor+'dd':ds.borderColor+'22';
    });
    var lbl = document.getElementById('site-label');
    lbl.textContent='● '+nm; lbl.style.color=chart.data.datasets[di].borderColor;
    lbl.style.display='block'; chart.update('none');
  };

  const nSites = Object.keys(bySite).length;
  document.getElementById('ched').textContent = param;
  document.getElementById('cby').textContent = `${filtered.length.toLocaleString()} observations · ${nSites} sites · ${yMin}–${yMax}`;
  document.getElementById('viz').style.display = 'block';

  const vals = filtered.map(r=>r.value).sort((a,b)=>a-b);
  const mean = (vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(3);
  const med  = vals[Math.floor(vals.length/2)].toFixed(3);
  const excPct = gShow ? (vals.filter(v=>v>gVal).length/vals.length*100).toFixed(1) : null;
  document.getElementById('ss').style.display='block';
  document.getElementById('si').innerHTML = [
    ['n',vals.length.toLocaleString()],['Mean',mean],['Median',med],
    ['Min',vals[0].toFixed(3)],['Max',vals[vals.length-1].toFixed(3)],
    ...(excPct!==null?[['% > threshold',excPct+'%','exc']]:[])
  ].map(([l,v,c=''])=>`<div class="sv"><div class="sl">${l}</div><div class="svv ${c}">${v}</div></div>`).join('');

  document.getElementById('lw').style.display='block';
  const byGroup = {};
  Object.entries(bySite).forEach(([code]) => {
    const g=(SITE_LOOKUP[code]||{}).group||'Other';
    if(!byGroup[g])byGroup[g]=[];byGroup[g].push(code);
  });
  document.getElementById('li').innerHTML = Object.entries(byGroup).map(([g,codes])=>
    `<div style="margin-bottom:.4rem;width:100%">
      <div style="font-family:var(--mono);font-size:.52rem;letter-spacing:.14em;text-transform:uppercase;color:${GROUP_COLOURS[g]||'#888'};margin-bottom:.2rem">${g}</div>
      <div style="display:flex;flex-wrap:wrap;gap:.25rem">${codes.map(code=>`
        <div class="lit" style="cursor:pointer" onclick="panToSite('${code}')" title="Pan to site on map">
          <div class="ld" style="background:${GROUP_COLOURS[(SITE_LOOKUP[code]||{}).group]||'#888'}"></div>
          ${(SITE_LOOKUP[code]||{name:code}).name}
        </div>`).join('')}
      </div>
    </div>`
  ).join('');

  document.getElementById('th').innerHTML='<tr><th>Date</th><th>Site</th><th>Group</th><th>Value</th></tr>';
  document.getElementById('tb2').innerHTML=filtered.slice(0,500).map(r=>{
    const s=SITE_LOOKUP[r.site]||{name:r.site,group:''};
    return`<tr><td>${new Date(r.date).toLocaleDateString('en-GB')}</td><td>${s.name}</td><td>${s.group}</td><td>${r.value}</td></tr>`;
  }).join('');

  setStatus(`✓  ${filtered.length.toLocaleString()} observations · ${nSites} sites · ${param}`, 'ok');
}

function setStatus(msg,cls=''){const el=document.getElementById('st');el.style.display='block';el.className=cls;el.textContent=msg;}

// ── EVENTS ────────────────────────────────────────────────────────────
document.getElementById('rb').addEventListener('click', renderChart);
document.getElementById('sel-all').addEventListener('click', () => {
  Object.entries(SITE_LOOKUP).forEach(([c,s])=>{if(activeGroups.has(s.group))activeSites.add(c);});
  buildSiteList(); updateMapMarkers();
});
document.getElementById('sel-none').addEventListener('click', () => {
  activeSites.clear(); buildSiteList(); updateMapMarkers();
});
document.getElementById('sel-group').addEventListener('click', () => {
  // Select only sites in active groups
  activeSites.clear();
  Object.entries(SITE_LOOKUP).forEach(([c,s])=>{if(activeGroups.has(s.group))activeSites.add(c);});
  buildSiteList(); updateMapMarkers();
});
['ym','yx'].forEach(id => document.getElementById(id).addEventListener('input', function() {
  document.getElementById(id+'v').textContent = this.value;
}));
document.getElementById('db').addEventListener('click', () => {
  if(!chart)return;
  const a=document.createElement('a');
  a.href=document.getElementById('cc').toDataURL('image/png');
  a.download=`blyth_wq_${document.getElementById('ps').value.replace(/\s+/g,'_')}.png`;
  a.click();
});
document.getElementById('tb').addEventListener('click', () => {
  const w=document.getElementById('tw');w.style.display=w.style.display==='none'?'block':'none';
});

init();
