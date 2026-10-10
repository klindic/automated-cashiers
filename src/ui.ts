import { DEFAULT_CONFIG } from './simulation/config';
export const icons = {
  play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="4"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg>',
  export: '<svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
};
export function mountUI(root: HTMLElement) {
  root.innerHTML = `
  <header class="app-header"><a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Checkout Lab početna"><span class="brand-icon"><i></i><i></i><i></i></span><span>checkout<span class="brand-light">lab</span><small>SIMULACIJA TOKA KUPACA</small></span></a><div class="header-meta"><span class="version">PROTOTIP 01</span><span class="live-badge"><i></i> LOKALNI POKUS</span></div></header>
  <main>
    <div class="page-heading"><div><span class="eyebrow">USPOREDBA SUSTAVA / 3D</span><h1>Bolji protok počinje ovdje.</h1><p>Isti kupci. Dva sustava. Rezultati koje možeš istražiti.</p></div><div class="export-wrap"><button id="export-toggle" class="button secondary">${icons.export} Izvoz podataka</button><div id="export-menu" class="export-menu" hidden><button id="export-customers">Kupci · CSV</button><button id="export-samples">Vremenski uzorci · CSV</button></div></div></div>
    <div class="workspace">
      <aside class="control-panel">
        <div class="panel-title"><span class="eyebrow">POSTAVKE POKUSA</span><span class="step-dot">01</span></div>
        <label class="field-label">Intenzitet dolazaka</label><div class="segmented traffic" role="group" aria-label="Intenzitet prometa"><button data-preset="quiet">Mirno</button><button data-preset="normal">Normalno</button><button data-preset="rush" class="selected">Špica</button></div><p id="arrival-label" class="field-help">Jedan kupac svakih 2–8 sekundi</p>
        <div class="field-row"><label for="lanes">Blagajne po sustavu</label><select id="lanes">${[1,2,3,4].map(n=>`<option ${n===4?'selected':''}>${n}</option>`).join('')}</select></div>
        <div class="field-row"><label for="stations">Stanice za pakiranje <small>Tunelska blagajna</small></label><select id="stations">${[1,2,3,4].map(n=>`<option ${n===3?'selected':''}>${n}</option>`).join('')}</select></div>
        <div class="field-row"><label for="duration">Trajanje dolazaka</label><select id="duration"><option value="300">5 min</option><option value="600" selected>10 min</option><option value="1200">20 min</option></select></div>
        <div class="field-row"><label for="seed">Sjeme pokusa <small>Za ponovljive rezultate</small></label><input id="seed" type="number" min="0" max="4294967295" value="12345"/></div>
        <details class="advanced"><summary>Vremena i pretpostavke <span>+</span></summary><div class="advanced-content">
          <p>Vrijednosti su procjene. Skeniranje je bez pogrešaka; put kupaca je vizualno pojednostavljen.</p>
          ${[['classicScanTime','Ručno skeniranje / artikl',.1,10,.1],['tunnelScanTime','Tunelsko skeniranje / artikl',.1,10,.1],['loadTime','Utovar / artikl',.1,10,.1],['bagPerItem','Pakiranje / artikl',.1,10,.1],['payCard','Plaćanje karticom',.1,60,.1],['payCash','Plaćanje gotovinom',.1,120,.1],['beltSpeed','Brzina trake · jed./s',.1,10,.1]].map(([key,label,min,max,step])=>`<label class="advanced-field">${label}<span><input data-config="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${DEFAULT_CONFIG[key as keyof typeof DEFAULT_CONFIG]}"/> ${key==='beltSpeed'?'':'s'}</span></label>`).join('')}
          <p>2–30 artikala · 75% kartica · 3 s pripreme pakiranja. Traka 12 jedinica; razmak artikala 0,8. Klasične blagajne su sve dostupne.</p>
        </div></details>
        <button id="apply" class="button apply" disabled>Primijeni i pokreni novi pokus</button><p id="config-hint" class="field-help">Obje zone koriste isti niz kupaca.</p>
        <div class="control-divider"></div>
        <div class="speed-heading"><label for="speed">Brzina simulacije</label><output id="speed-output">1×</output></div><input id="speed" class="speed-slider" type="range" min="1" max="20" value="1"/><div class="range-labels"><span>1×</span><span>10×</span><span>20×</span></div>
        <div class="playback"><button id="play" class="button primary">${icons.pause}<span>Pauziraj</span></button><button id="reset" class="button square" title="Ponovi pokus s istim postavkama" aria-label="Ponovi pokus">${icons.reset}</button></div>
        <div class="clock-row"><span id="status-label"><i class="running-dot"></i> U tijeku</span><span><strong id="clock">00:00</strong><span id="duration-label"> / 10:00</span></span></div><div class="progress-track"><div id="progress-bar"></div></div>
        <div class="model-note"><span>↳</span><p>Promijeni jednu pretpostavku.<br>Promatraj gdje nastaje čekanje.</p></div>
      </aside>
      <section class="scene-panel" aria-label="Interaktivna 3D simulacija">
        <canvas id="scene" aria-label="3D prikaz dvaju sustava blagajni; povuci za rotaciju, kotačić za približavanje"></canvas>
        <div id="scene-loading" class="scene-loading"><span class="loader"></span> Priprema 3D scene…</div>
        <div class="scene-toolbar"><span class="scene-label"><i></i> PRIKAZ UŽIVO</span><div class="camera-group" role="group" aria-label="Položaj kamere"><button data-camera="all" class="selected">Pregled</button><button data-camera="tunnel">Tunelske</button><button data-camera="classic">Klasične</button><button id="fullscreen" title="Puni zaslon" aria-label="Puni zaslon">${icons.expand}</button></div></div>
        <div class="zone-cards"><div class="zone-card tunnel"><span class="zone-letter">A</span><div><strong>Tunelski sustav</strong><small><span id="tunnel-active">0</span> aktivnih blagajni</small></div><div class="zone-total"><strong id="tunnel-exited">0</strong><small>izašlo</small></div></div><div class="zone-card classic"><span class="zone-letter">B</span><div><strong>Klasični sustav</strong><small><span id="classic-active">0</span> aktivnih blagajni</small></div><div class="zone-total"><strong id="classic-exited">0</strong><small>izašlo</small></div></div></div>
        <div id="selection" class="selection" hidden></div>
        <div class="scene-footer"><span>↔ Povuci za rotaciju <b>·</b> Kotačić za približavanje</span><div class="state-legend"><span><i class="green"></i>Rad</span><span><i class="amber"></i>Plaćanje</span><span><i class="red"></i>Zastoj</span><span><i class="gray"></i>Mirovanje</span></div></div>
      </section>
    </div>
    <section id="horizon-summary" class="horizon-summary" hidden><div><span class="eyebrow">REZULTAT NA KRAJU DOLAZAKA</span><h2 id="summary-title"></h2><p id="summary-text"></p></div><button id="drain" class="button primary">Isprazni preostale redove →</button></section>
    <section class="analytics-grid">
      <article class="chart-panel"><div class="card-heading"><div><span class="eyebrow">PROTOK KROZ VRIJEME</span><h2>Koliko je kupaca završilo?</h2></div><div class="chart-legend"><span><i class="cyan"></i>Tunelski</span><span><i class="orange"></i>Klasični</span></div></div><div id="chart" class="chart"></div><div class="chart-foot"><span>Kumulativni izlasci · uzorci svakih 10 s</span><span id="arrivals-total">0 zajedničkih dolazaka</span></div></article>
      <article class="metrics-panel"><div class="card-heading"><div><span class="eyebrow">MJERENJA UŽIVO</span><h2>Gdje nastaje razlika?</h2></div><span class="live-dot"></span></div><table class="metrics-table"><thead><tr><th>Metrika</th><th class="tunnel-text">A · Tunelski</th><th class="classic-text">B · Klasični</th></tr></thead><tbody id="metrics-body"></tbody></table><p class="metrics-note">* Trajanje: završeni kupci. ¹ Čekanje: kupci koji su počeli utovar. ² Udio ukupnog vremena svih blagajni; zastoj je odvojen od rada.</p></article>
    </section>
    <footer class="app-footer"><span><span class="footer-mark">◈</span> CHECKOUT LAB <b> / </b> Eksperimentalni model</span><span>Procjene vremena · bez pogrešaka skeniranja · identični dolasci</span></footer>
    <div id="toast" class="toast" role="status" hidden></div>
  </main>`;
}
