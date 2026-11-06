(() => {
  const root = document.querySelector('#app');
  const programs = ['Livelo', 'Smiles', 'LATAM Pass', 'Esfera', 'Outro'];
  const steps = [
    ['Loja ou parceiro', 'Onde você fez a compra bonificada?'],
    ['Programa de pontos', 'Escolha o programa que receberá os pontos desta compra.'],
    ['Valor da compra', 'Informe o valor da compra em reais.'],
    ['Fator de pontuação', 'Quantos pontos por real a campanha oferece?'],
    ['Data da compra', 'Quando você concluiu essa compra?'],
    ['Prazo esperado', 'Quando os pontos devem entrar na sua conta?'],
    ['Mais informações', 'Esses detalhes são opcionais e ajudam na hora de cobrar.'],
    ['Revise sua compra', 'Confira os dados antes de salvar.']
  ];
  let data = { purchases: [], partners: [], programs: programs.slice(0, 4) };
  let page = 'home';
  let wizard = null;
  let step = 0;
  let filter = 'Todas';
  let query = '';
  let selectedId = null;
  let toastTimer;
  let authEmail = '';
  let pendingEmail = '';
  let firstAccess = false;

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir. Tente novamente.');
    return result;
  }
  async function loadAccount() {
    const session = await api('/api/session');
    if (!session.authenticated) { loginPage(); return; }
    authEmail = session.email;
    const purchases = await api('/api/purchases');
    data = { purchases, partners: [...new Set(purchases.map(p => p.partner).filter(Boolean))], programs: [...new Set([...programs.slice(0, 4), ...purchases.map(p => p.program).filter(Boolean)])] };
    home();
  }
  function clearAccount() {
    authEmail = ''; data = { purchases: [], partners: [], programs: programs.slice(0, 4) };
    loginPage();
  }
  const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => new Date().toISOString().slice(0,10);
  const brDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
  const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const points = value => Math.round(Number(value || 0)).toLocaleString('pt-BR');
  const normalize = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function dueStatus(p) { if (p.status === 'received') return 'received'; if (p.dueDate < today()) return 'late'; return 'pending'; }
  function statusName(s) { return ({pending:'Aguardando pontos',late:'Pontos em atraso',received:'Pontos recebidos',review:'Conferir lançamento'})[s] || 'Aguardando pontos'; }
  function statusTag(s) { return `<span class="status ${s}">${statusName(s)}</span>`; }
  function toast(message) { clearTimeout(toastTimer); const el = document.createElement('div'); el.className='toast'; el.textContent=message; document.body.append(el); toastTimer=setTimeout(()=>el.remove(),2600); }
  function brand() { return `<a class="brand" href="#" data-action="home"><img src="pontos-mark.svg" alt=""><span class="brand-name">Cadê meus<span>pontos?</span></span></a>`; }
  function shell(content) {
    root.innerHTML = `<div class="shell"><header class="topbar">${brand()}<nav class="nav" aria-label="Navegação"><button class="${page==='home'?'active':''}" data-action="home">Início</button><button class="${['list','detail'].includes(page)?'active':''}" data-action="list">Meu extrato</button><span class="pill-user">${esc(authEmail)}</span><button class="quiet" data-action="logout">Sair</button></nav></header><main class="main">${content}</main><footer class="footer"><span>Cadê meus pontos? <span>Controle simples, no seu tempo.</span></span><span>Dados salvos com segurança na nuvem · <a href="#" data-action="about">Como funciona</a></span></footer></div>`;
  }
  function loginPage(mode = 'email', message = '') {
    page = 'login';
    const codeMode = mode === 'code';
    root.innerHTML = `<div class="shell"><header class="topbar">${brand()}<span class="pill-user">Acesso seguro</span></header><main class="main login-main"><section class="login-card card"><div class="info-icon">${codeMode ? '✉' : '✦'}</div><p class="eyebrow">Seu espaço pessoal</p><h1>${codeMode ? 'Confira seu e-mail.' : 'Seus pontos, só seus.'}</h1><p class="login-copy">${codeMode ? `Enviamos uma chave temporária para <strong>${esc(pendingEmail)}</strong>. Digite-a abaixo para continuar.` : 'Acesse para registrar compras e acompanhar seus pontos em qualquer dispositivo. Sem senha: usamos uma chave temporária enviada ao seu e-mail.'}</p>${message ? `<p class="login-message" role="status">${esc(message)}</p>` : ''}<form data-form="${codeMode ? 'verify' : 'request'}">${codeMode ? `<label class="form-label" for="code-input">Chave de acesso</label><input class="control code-input" id="code-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]{8}" placeholder="00000000" required>` : `<label class="form-label" for="email-input">Seu e-mail</label><input class="control" id="email-input" name="email" type="email" autocomplete="email" maxlength="254" placeholder="voce@exemplo.com" required>`}<button class="btn btn-primary login-submit" type="submit">${codeMode ? 'Entrar no meu espaço' : 'Enviar chave de acesso'}</button></form>${codeMode ? `<button class="quiet login-back" data-action="back-login">Usar outro e-mail</button><button class="quiet login-back" data-action="resend-code">Reenviar chave</button>` : ''}<p class="login-note">${codeMode ? 'A chave é de uso único e expira em 10 minutos.' : 'Primeiro acesso? Seu espaço pessoal será criado automaticamente após confirmar a chave.'}</p></section></main><footer class="footer"><span>Cadê meus pontos? <span>Controle simples, no seu tempo.</span></span><span><a href="#" data-action="about">Privacidade e funcionamento</a></span></footer></div>`;
  }
  function firstAccessPage() {
    page = 'first-access';
    shell(`<section class="login-card card"><div class="info-icon">✓</div><p class="eyebrow">Espaço criado</p><h1>Vamos registrar sua primeira compra.</h1><p class="login-copy">Seu acesso está confirmado. As compras que você registrar ficarão salvas com segurança e vinculadas a ${esc(authEmail)}.</p><button class="btn btn-primary login-submit" data-action="first-start">Monitorar compra bonificada</button><button class="btn btn-secondary login-submit" data-action="home">Ir para o início</button></section>`);
  }
  function summary() {
    const purchases=data.purchases; const received=purchases.filter(p=>p.status==='received'); const waiting=purchases.filter(p=>p.status!=='received'); const overdue=waiting.filter(p=>dueStatus(p)==='late');
    return `<div class="stats"><article class="stat purple"><div class="stat-label">◉ &nbsp;Pontos a caminho</div><div class="stat-value">${points(waiting.reduce((s,p)=>s+p.expected,0))}</div><div class="stat-sub">em ${waiting.length} ${waiting.length===1?'compra':'compras'}</div></article><article class="stat green"><div class="stat-label">✓ &nbsp;Pontos recebidos</div><div class="stat-value">${points(received.reduce((s,p)=>s+(p.received||p.expected),0))}</div><div class="stat-sub">${received.length} ${received.length===1?'compra confirmada':'compras confirmadas'}</div></article><article class="stat amber"><div class="stat-label">! &nbsp;Precisam de atenção</div><div class="stat-value">${overdue.length}</div><div class="stat-sub">${overdue.length===1?'compra passou':'compras passaram'} do prazo</div></article></div>`;
  }
  function purchaseRow(p) {
    const s=dueStatus(p);
    return `<article class="purchase-row" data-action="detail" data-id="${esc(p.id)}"><div><div class="store-name">${esc(p.partner)}</div><div class="program-name">${esc(p.program)}</div></div><div class="row-secondary"><div class="row-value">${points(p.expected)} <small>pontos</small></div><div class="row-meta">Previsão: ${brDate(p.dueDate)}</div></div><div class="row-secondary"><div class="row-value">${money(p.amount)}</div><div class="row-meta">Compra em ${brDate(p.purchaseDate)}</div></div><div class="row-status">${statusTag(s)}</div></article>`;
  }
  function home() {
    page='home'; const latest=[...data.purchases].sort((a,b)=>b.createdAt-a.createdAt).slice(0,3);
    shell(`<section class="hero"><div><p class="eyebrow">Mais clareza para suas compras bonificadas</p><h1>Seus pontos,<br>no seu radar.</h1><p>Controle suas compras bonificadas, acompanhe seus pontos e saiba quando abrir uma reclamação para o parceiro!</p><div class="hero-actions"><button class="btn btn-primary" data-action="new">＋ &nbsp;Monitorar compra bonificada</button><button class="btn btn-secondary" data-action="list">Meu extrato <span aria-hidden="true">→</span></button></div></div><div class="hero-art" aria-hidden="true"><div class="orbit-card one">Sua próxima previsão<strong>em acompanhamento</strong></div><img src="pontos-mark.svg" alt=""><div class="orbit-card two">Pontos esperados<strong>+12 por real</strong></div></div></section><aside class="transparency"><div class="info-icon">i</div><div><strong>Seus dados, do jeito transparente.</strong><p>Importante: o Cadê meus pontos não acessa suas contas, não consulta seus saldos e não se conecta aos programas de fidelidade. Você registra suas compras manualmente e acompanha tudo por aqui.</p></div></aside><section><div class="section-heading"><div><h2>Seu acompanhamento</h2><p>Um resumo das compras que você registrou.</p></div></div>${summary()}</section><section class="recent"><div class="section-heading"><div><h2>Adicionados recentemente</h2><p>Suas compras mais novas, sempre à mão.</p></div>${data.purchases.length?'<button class="btn btn-secondary btn-small" data-action="list">Ver extrato →</button>':''}</div>${latest.length?`<div class="purchase-list">${latest.map(purchaseRow).join('')}</div>`:`<div class="empty"><img src="pontos-mark.svg" alt=""><h3>Seu radar está pronto.</h3><p>Adicione uma compra bonificada para começar a acompanhar seus pontos por aqui.</p><button class="btn btn-primary btn-small" data-action="new">Monitorar minha primeira compra</button></div>`}</section>`);
  }
  function listPage() {
    page='list'; let arr=[...data.purchases].sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
    arr=arr.filter(p=>{const s=dueStatus(p); return (filter==='Todas'||(filter==='Em atraso'&&s==='late')||(filter==='Aguardando'&&s==='pending')||(filter==='Recebidos'&&s==='received'))&&(!query||normalize(`${p.partner} ${p.program} ${p.order}` ).includes(normalize(query)));});
    shell(`<div class="page-title"><h1>Meu extrato</h1><p>Acompanhe o que está a caminho e o que já chegou.</p></div><div class="filters"><input class="field" id="search" placeholder="Buscar loja, programa ou pedido" value="${esc(query)}" aria-label="Buscar compras"><select id="filter" aria-label="Filtrar compras">${['Todas','Aguardando','Em atraso','Recebidos'].map(f=>`<option ${filter===f?'selected':''}>${f}</option>`).join('')}</select><button class="btn btn-primary btn-small" data-action="new">＋ Nova compra</button></div><div class="list-head"><span>${arr.length} ${arr.length===1?'compra':'compras'}</span><span>Ordenado pela previsão</span></div>${arr.length?`<div class="purchase-list">${arr.map(purchaseRow).join('')}</div>`:`<div class="empty"><h3>${data.purchases.length?'Nenhuma compra encontrada.':'Seu extrato está vazio por enquanto.'}</h3><p>${data.purchases.length?'Tente mudar o filtro ou a busca.':'Registre uma compra para acompanhar a previsão dos seus pontos.'}</p>${data.purchases.length?'':'<button class="btn btn-primary btn-small" data-action="new">Monitorar compra bonificada</button>'}</div>`}`);
    document.querySelector('#search').addEventListener('input',e=>{query=e.target.value;const pos=e.target.selectionStart;listPage();const input=document.querySelector('#search');input.focus();input.setSelectionRange(pos,pos);});
    document.querySelector('#filter').addEventListener('change',e=>{filter=e.target.value;listPage();});
  }
  function startWizard() { wizard={partner:'',program:'',customProgram:'',amount:'',factor:'',purchaseDate:today(),days:'30',dayType:'corridos',dueDate:'',order:'',notes:'',regulation:'',attachment:''}; wizard.dueDate=addDays(wizard.purchaseDate,30,false);step=0;page='wizard';renderWizard(); }
  function addDays(date, count, business) { if(!date||!count)return date; const d=new Date(`${date}T12:00:00`); let n=0; while(n<Number(count)){d.setDate(d.getDate()+1);if(!business||![0,6].includes(d.getDay()))n++;}return d.toISOString().slice(0,10); }
  function field(label, key, type='text', placeholder='', extra='') { return `<div class="field-group"><label class="form-label" for="${key}">${label}</label><input class="control" id="${key}" type="${type}" value="${esc(wizard[key])}" placeholder="${esc(placeholder)}" ${extra}></div>`; }
  function renderWizard() {
    page='wizard';const [title,desc]=steps[step];let body='';
    if(step===0){const matches=data.partners.filter(n=>normalize(n).includes(normalize(wizard.partner||'').slice(0,4))&&wizard.partner).slice(0,4);body=`<label class="form-label" for="partner">Nome da loja ou parceiro</label><input class="control" id="partner" list="partners" placeholder="Ex.: Loja Exemplo" value="${esc(wizard.partner)}" autocomplete="off"><datalist id="partners">${data.partners.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>${matches.length?`<div class="chips">${matches.map(n=>`<button class="chip" data-action="choose-partner" data-value="${esc(n)}">Usar ${esc(n)}</button>`).join('')}</div>`:''}<p class="file-hint">Loja e programa de pontos são informações diferentes. Vamos manter cada lista organizada.</p>`;}
    if(step===1){body=`<div class="choice-grid">${[...data.programs,'Outro'].filter((n,i,a)=>a.indexOf(n)===i).map((p,i)=>`<button class="choice ${wizard.program===p?'selected':''}" data-action="program" data-value="${esc(p)}"><span class="choice-mark">${p==='LATAM Pass'?'L':p==='Outro'?'＋':p.slice(0,1)}</span><span>${esc(p)}<small>${p==='Outro'?'Adicionar programa':'Programa de pontos'}</small></span></button>`).join('')}</div>${wizard.program==='Outro'?field('Nome do programa','customProgram','text','Ex.: Azul Fidelidade'):''}<p class="file-hint">Cada lançamento acompanha um único programa. Se a campanha pontuar em dois programas, registre cada um separadamente.</p>`;}
    if(step===2){body=`<div class="field-group"><label class="form-label" for="amount">Valor da compra</label><div class="input-wrap"><span class="input-prefix">R$</span><input class="control has-prefix" id="amount" inputmode="decimal" placeholder="0,00" value="${esc(wizard.amount)}"></div></div><p class="file-hint">Informe o valor da compra. Nesta versão, não é necessário separar frete ou descontos.</p>`;}
    if(step===3){body=`<div class="field-group"><label class="form-label" for="factor">Quantos pontos por real?</label><div class="input-wrap"><input class="control" id="factor" inputmode="decimal" placeholder="Ex.: 12" value="${esc(wizard.factor)}"><span class="input-prefix" style="left:auto;right:15px">pontos / R$</span></div></div><div class="calc-box"><span>${money(parseFloat(String(wizard.amount).replace(',','.'))||0)} × ${esc(wizard.factor||'0')} pontos por real</span><strong id="calc">${points((parseFloat(String(wizard.amount).replace(',','.'))||0)*(parseFloat(String(wizard.factor).replace(',','.'))||0))} pontos</strong></div>`;}
    if(step===4){body=field('Data da compra','purchaseDate','date');}
    if(step===5){body=`<div class="field-group"><label class="form-label" for="days">Prazo esperado</label><input class="control" id="days" type="number" min="0" placeholder="Ex.: 30" value="${esc(wizard.days)}"><div class="chips">${[10,15,20,30,45,60].map(n=>`<button class="chip ${Number(wizard.days)===n?'selected':''}" data-action="days" data-value="${n}">${n} dias</button>`).join('')}</div></div><div class="field-group"><span class="form-label">Contar</span><div class="radio-row"><button class="${wizard.dayType==='corridos'?'selected':''}" data-action="day-type" data-value="corridos">Dias corridos</button><button class="${wizard.dayType==='uteis'?'selected':''}" data-action="day-type" data-value="uteis">Dias úteis</button></div></div><div class="field-group"><label class="form-label" for="dueDate">Data prevista de recebimento</label><input class="control" id="dueDate" type="date" value="${esc(wizard.dueDate)}"><p class="file-hint">A data editada aqui será a referência usada para identificar atrasos.</p></div>`;}
    if(step===6){body=`<div class="form-row">${field('Número do pedido (opcional)','order','text','Ex.: 123-456')}${field('Link do regulamento (opcional)','regulation','url','https://')}</div><div class="field-group"><label class="form-label" for="notes">Observações (opcional)</label><textarea class="control" id="notes" maxlength="300" rows="3" placeholder="Uma anotação curta sobre a campanha">${esc(wizard.notes)}</textarea><div class="file-hint"><span id="note-count">${wizard.notes.length}</span> / 300 caracteres</div></div><div class="field-group"><label class="form-label" for="attachment">Regulamento em PDF ou PNG (opcional)</label><input class="control" id="attachment" type="file" accept="application/pdf,image/png"><p class="file-hint">O arquivo será salvo com sua compra e deve conter somente o regulamento da campanha. Não anexe notas fiscais, documentos pessoais, dados bancários ou imagens de cartões. Limite de 1 MB.</p>${wizard.attachment?`<div class="file-hint">Arquivo selecionado: ${esc(wizard.attachment)}</div>`:''}</div>`;}
    if(step===7){body=`<div class="summary-grid"><div class="summary-item"><span>Loja ou parceiro</span><strong>${esc(wizard.partner)}</strong></div><div class="summary-item"><span>Programa de pontos</span><strong>${esc(wizard.program==='Outro'?wizard.customProgram:wizard.program)}</strong></div><div class="summary-item"><span>Valor da compra</span><strong>${money(parseFloat(String(wizard.amount).replace(',','.'))||0)}</strong></div><div class="summary-item"><span>Fator de pontuação</span><strong>${esc(wizard.factor)} pontos / R$</strong></div><div class="summary-item"><span>Data da compra</span><strong>${brDate(wizard.purchaseDate)}</strong></div><div class="summary-item"><span>Previsão dos pontos</span><strong>${brDate(wizard.dueDate)}</strong></div><div class="summary-item"><span>Pontos esperados</span><strong style="color:var(--purple)">${points((parseFloat(String(wizard.amount).replace(',','.'))||0)*(parseFloat(String(wizard.factor).replace(',','.'))||0))}</strong></div><div class="summary-item"><span>Pedido / campanha</span><strong>${esc(wizard.order||wizard.regulation||'Não informado')}</strong></div></div>`;}
    shell(`<button class="quiet back" data-action="cancel">← &nbsp;Voltar ao início</button><section class="wizard card"><div class="progress-head"><span>Nova compra bonificada</span><span>Etapa ${step+1} de ${steps.length}</span></div><div class="progress"><span style="width:${((step+1)/steps.length)*100}%"></span></div><h2>${title}</h2><p class="hint">${desc}</p><div class="wizard-body">${body}</div><div class="wizard-actions">${step?'<button class="btn btn-secondary" data-action="prev">← &nbsp;Voltar</button>':'<button class="btn btn-secondary" data-action="cancel">Cancelar</button>'}${step<7?'<button class="btn btn-primary" data-action="next">Continuar &nbsp;→</button>':'<button class="btn btn-primary" data-action="save">Salvar compra</button>'}</div></section>`);
    bindWizardInputs();
  }
  function bindWizardInputs(){
    const bind=(id,key,fn)=>{const el=document.querySelector(`#${id}`);if(el)el.addEventListener('input',e=>{wizard[key]=e.target.value;if(fn)fn(e.target.value);});};
    bind('partner','partner',()=>{if(step===0)renderWizardKeepFocus('partner')});
    bind('customProgram','customProgram');bind('amount','amount',()=>{const a=parseFloat(String(wizard.amount).replace(',','.'))||0,f=parseFloat(String(wizard.factor).replace(',','.'))||0;const calc=document.querySelector('#calc');if(calc)calc.textContent=`${points(a*f)} pontos`;});bind('factor','factor',()=>{const a=parseFloat(String(wizard.amount).replace(',','.'))||0,f=parseFloat(String(wizard.factor).replace(',','.'))||0;const calc=document.querySelector('#calc');if(calc)calc.textContent=`${points(a*f)} pontos`;});bind('purchaseDate','purchaseDate',()=>{wizard.dueDate=addDays(wizard.purchaseDate,wizard.days,wizard.dayType==='uteis');});
    bind('days','days',()=>{wizard.dueDate=addDays(wizard.purchaseDate,wizard.days,wizard.dayType==='uteis');const due=document.querySelector('#dueDate');if(due)due.value=wizard.dueDate;});bind('dueDate','dueDate');bind('order','order');bind('regulation','regulation');bind('notes','notes',v=>{const c=document.querySelector('#note-count');if(c)c.textContent=v.length;});
    const file=document.querySelector('#attachment');if(file)file.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;if(f.size>1024*1024){e.target.value='';toast('O arquivo deve ter até 1 MB.');return;}if(!['application/pdf','image/png'].includes(f.type)){e.target.value='';toast('Escolha um arquivo PDF ou PNG.');return;}const reader=new FileReader();reader.onload=()=>{wizard.attachment=f.name;wizard.attachmentData=reader.result;renderWizard();};reader.readAsDataURL(f);});
  }
  function renderWizardKeepFocus(id){const el=document.querySelector(`#${id}`);const pos=el?.selectionStart;const value=wizard[id];renderWizard();const next=document.querySelector(`#${id}`);if(next){next.focus();next.value=value;if(pos!=null)next.setSelectionRange(pos,pos);}}
  function validateStep(){if(step===0){wizard.partner=wizard.partner.trim().replace(/\s+/g,' ');if(!wizard.partner)return 'Informe o nome da loja ou parceiro.';const match=data.partners.find(n=>normalize(n)===normalize(wizard.partner));if(match)wizard.partner=match;}
    if(step===1){if(!wizard.program)return 'Escolha um programa de pontos.';if(wizard.program==='Outro'){wizard.customProgram=wizard.customProgram.trim().replace(/\s+/g,' ');if(!wizard.customProgram)return 'Informe o nome do programa.';const match=[...data.programs].find(n=>normalize(n)===normalize(wizard.customProgram));if(match)wizard.customProgram=match;else data.programs.push(wizard.customProgram);}}
    if(step===2){const n=parseFloat(String(wizard.amount).replace(',','.'));if(!Number.isFinite(n)||n<=0)return 'Informe um valor de compra maior que zero.';wizard.amount=String(n);}
    if(step===3){const n=parseFloat(String(wizard.factor).replace(',','.'));if(!Number.isFinite(n)||n<=0)return 'Informe um fator de pontuação maior que zero.';wizard.factor=String(n);}
    if(step===4&&!wizard.purchaseDate)return 'Informe a data da compra.';
    if(step===5){if(!wizard.days||Number(wizard.days)<0)return 'Informe um prazo válido.';if(!wizard.dueDate)return 'Informe a previsão de recebimento.';}
    if(step===6&&wizard.regulation&&!/^https?:\/\//i.test(wizard.regulation))return 'O link do regulamento deve começar com http:// ou https://.'; return '';}
  async function savePurchase(){const partner=wizard.partner;const found=data.partners.find(n=>normalize(n)===normalize(partner));const amount=parseFloat(wizard.amount);const factor=parseFloat(wizard.factor);const purchase={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),partner:found||partner,program:wizard.program==='Outro'?wizard.customProgram:wizard.program,amount,factor,expected:amount*factor,purchaseDate:wizard.purchaseDate,days:Number(wizard.days),dayType:wizard.dayType,dueDate:wizard.dueDate,order:wizard.order.trim(),notes:wizard.notes.trim(),regulation:wizard.regulation.trim(),attachment:wizard.attachment,attachmentData:wizard.attachmentData||'',status:'pending',createdAt:Date.now()};try{const saved=await api('/api/purchases',{method:'POST',body:JSON.stringify(purchase)});data.purchases.unshift(saved);if(!found)data.partners.push(partner);toast('Compra salva. Vamos acompanhar esses pontos!');home();}catch(error){toast(error.message);}}
  function complaint(p){return `Olá! Gostaria de solicitar a verificação do crédito dos pontos da campanha bonificada.\n\nLoja/parceiro: ${p.partner}\nPrograma de pontos: ${p.program}\nNúmero do pedido: ${p.order||'não informado'}\nData da compra: ${brDate(p.purchaseDate)}\nValor da compra: ${money(p.amount)}\nFator anunciado: ${String(p.factor).replace('.',',')} pontos por real\nPontos esperados: ${points(p.expected)}\nPrevisão de crédito: ${brDate(p.dueDate)}\n\nO prazo informado já passou e os pontos ainda não foram creditados. Poderiam, por favor, verificar o ocorrido e informar a previsão de regularização?${p.regulation?`\n\nRegulamento da campanha: ${p.regulation}`:''}${p.notes?`\n\nObservações: ${p.notes}`:''}\n\nAgradeço desde já.`;}
  function detailPage(){page='detail';const p=data.purchases.find(x=>x.id===selectedId);if(!p){listPage();return;}const st=dueStatus(p);shell(`<button class="quiet back" data-action="list">← &nbsp;Voltar ao extrato</button><section class="card"><div class="detail-top"><div><p class="eyebrow">Compra bonificada</p><h1>${esc(p.partner)}</h1><p>${esc(p.program)} · compra em ${brDate(p.purchaseDate)}</p></div>${statusTag(st)}</div><div class="detail-metrics"><div class="detail-box"><span>Pontos esperados</span><strong style="color:var(--purple)">${points(p.expected)}</strong></div><div class="detail-box"><span>Previsão de recebimento</span><strong>${brDate(p.dueDate)}</strong></div><div class="detail-box"><span>Valor da compra</span><strong>${money(p.amount)}</strong></div></div><div class="detail-info"><div class="info-line"><span>Programa de pontos</span><strong>${esc(p.program)}</strong></div><div class="info-line"><span>Fator de pontuação</span><strong>${String(p.factor).replace('.',',')} pontos por real</strong></div><div class="info-line"><span>Número do pedido</span><strong>${esc(p.order||'Não informado')}</strong></div><div class="info-line"><span>Prazo informado</span><strong>${p.days} dias ${p.dayType==='uteis'?'úteis':'corridos'}</strong></div><div class="info-line"><span>Regulamento</span><strong>${p.regulation?`<a href="${esc(p.regulation)}" target="_blank" rel="noopener">Abrir regulamento ↗</a>`:'Não informado'}</strong></div><div class="info-line"><span>Anexo</span><strong>${p.attachment?`<a href="/api/purchases/${encodeURIComponent(p.id)}/attachment">${esc(p.attachment)} ↧</a>`:'Nenhum'}</strong></div>${p.notes?`<div class="info-line" style="grid-column:1/-1"><span>Observações</span><strong>${esc(p.notes)}</strong></div>`:''}</div>${st!=='received'?`<section class="complaint"><h3>Hora de abrir uma reclamação? Prepare sua mensagem</h3><p class="file-hint">Revise o texto e envie pelos canais oficiais da loja ou do programa. Não compartilhamos seus dados com terceiros.</p><textarea id="complaint-text">${esc(complaint(p))}</textarea><div class="detail-actions"><button class="btn btn-primary btn-small" data-action="copy">Copiar mensagem</button><button class="btn btn-secondary btn-small" data-action="received">Marcar pontos recebidos</button></div></section>`:`<section class="complaint"><h3>Pontos recebidos ✅</h3><p class="file-hint">Você marcou esta compra como recebida. Obrigado por manter seu acompanhamento atualizado.</p><button class="btn btn-secondary btn-small" data-action="unreceive">Desfazer marcação</button></section>`}</section>`);}
  function about(){page='about';root.innerHTML=`<div class="shell"><header class="topbar">${brand()}</header><main class="main"><div class="page-title"><h1>Como funciona</h1><p>Um lugar simples para você registrar, acompanhar e abrir uma reclamação.</p></div><section class="card"><h2 style="font:800 21px Manrope;margin-top:0">Seus programas continuam privados</h2><p style="line-height:1.7;color:#6c6474;text-align:justify">O Cadê meus pontos não acessa suas contas, não consulta saldos, não lê e-mails e não se conecta à Livelo, Smiles, LATAM Pass, Esfera ou outros programas. Você registra as compras e atualiza o acompanhamento manualmente. Nunca pedimos CPF, senha, documentos pessoais ou dados bancários.</p><h3 style="font:800 16px Manrope;margin-top:25px">Como fica seu acesso e seus dados?</h3><p style="line-height:1.7;color:#6c6474;text-align:justify">Acesse com seu e-mail e uma chave temporária de uso único. No primeiro acesso, criamos seu espaço pessoal. Compras e regulamentos ficam salvos com segurança na nuvem e vinculados ao seu e-mail para você recuperar em outro dispositivo.</p><button class="btn btn-secondary btn-small" data-action="about-back">Voltar</button></section></main></div>`;}
  root.addEventListener('submit', async e => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (form.dataset.form === 'request') {
        pendingEmail = form.elements.email.value.trim().toLowerCase();
        await api('/api/auth/request-code', { method: 'POST', body: JSON.stringify({ email: pendingEmail }) });
        loginPage('code', 'Se o endereço puder receber códigos, a chave chegará em instantes.');
      } else {
        const result = await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email: pendingEmail, code: form.elements.code.value.trim() }) });
        authEmail = result.email;
        firstAccess = Boolean(result.firstAccess);
        const purchases = await api('/api/purchases');
        data = { purchases, partners: [...new Set(purchases.map(p => p.partner).filter(Boolean))], programs: [...new Set([...programs.slice(0, 4), ...purchases.map(p => p.program).filter(Boolean)])] };
        if (firstAccess) firstAccessPage(); else home();
      }
    } catch (error) {
      if (form.dataset.form === 'verify') loginPage('code', error.message);
      else loginPage('email', error.message);
    }
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const action = b.dataset.action;
    if (action === 'about') { about(); return; }
    if (action === 'about-back') { if (authEmail) home(); else loginPage(); return; }
    if (action === 'back-login') { pendingEmail = ''; loginPage(); return; }
    if (action === 'resend-code') {
      try { await api('/api/auth/request-code', { method: 'POST', body: JSON.stringify({ email: pendingEmail }) }); loginPage('code', 'Se o endereço puder receber códigos, a nova chave chegará em instantes.'); }
      catch (error) { loginPage('code', error.message); }
      return;
    }
    if (action === 'logout') { try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } finally { clearAccount(); } return; }
    if (action === 'home') { if (!authEmail) { loginPage(); return; } home(); return; }
    if (action === 'list') { if (!authEmail) { loginPage(); return; } listPage(); return; }
    if (action === 'new') { if (!authEmail) { loginPage(); return; } startWizard(); return; }
    if (action === 'first-start') { startWizard(); return; }
    if (action === 'detail') { selectedId = b.dataset.id; detailPage(); return; }
    if (action === 'cancel') { home(); return; }
    if (action === 'prev') { if (step > 0) step--; renderWizard(); return; }
    if (action === 'next') { const error = validateStep(); if (error) { toast(error); return; } if (step < 7) step++; renderWizard(); return; }
    if (action === 'save') { const error = validateStep(); if (error) { toast(error); return; } await savePurchase(); return; }
    if (action === 'program') { wizard.program = b.dataset.value; renderWizard(); return; }
    if (action === 'days') { wizard.days = b.dataset.value; wizard.dueDate = addDays(wizard.purchaseDate, wizard.days, wizard.dayType === 'uteis'); renderWizard(); return; }
    if (action === 'day-type') { wizard.dayType = b.dataset.value; wizard.dueDate = addDays(wizard.purchaseDate, wizard.days, wizard.dayType === 'uteis'); renderWizard(); return; }
    if (action === 'choose-partner') { wizard.partner = b.dataset.value; renderWizard(); return; }
    if (action === 'copy') {
      const text = document.querySelector('#complaint-text').value;
      try { await navigator.clipboard.writeText(text); toast('Mensagem copiada.'); }
      catch { const ta = document.querySelector('#complaint-text'); ta.select(); document.execCommand('copy'); toast('Mensagem copiada.'); }
      return;
    }
    if (action === 'received' || action === 'unreceive') {
      const p = data.purchases.find(x => x.id === selectedId);
      if (!p) return;
      const status = action === 'received' ? 'received' : 'pending';
      try {
        const updated = await api(`/api/purchases/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        Object.assign(p, updated); detailPage(); toast(status === 'received' ? 'Compra atualizada.' : 'Marcação desfeita.');
      } catch (error) { toast(error.message); }
    }
  });
  loadAccount().catch(error => loginPage('email', `Não foi possível carregar seu acesso. ${error.message}`));
})();
