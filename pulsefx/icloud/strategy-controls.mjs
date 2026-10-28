// MARK: - Native Strategy-keuzes
// Comment NL: Standaardtitels uit JournalOptionsStore; bestaande eigen waarden blijven behouden.
const choices = {
  setupsSelectedRaw: ['Break & retest', 'CHoCH', 'BOS', 'Order block', 'Fair value gap', 'Liquidity sweep', 'Inducement'],
  timeframesSelectedRaw: ['1m', '5m', '15m', '30m', '1H', '4H', 'Daily', 'Weekly'],
  mistakesSelectedRaw: ['Entered too early', 'Entered too late', 'SL too tight', 'SL too wide', 'FOMO', 'No confluences', 'Ignored news'],
};
export function decorateStrategy(key, control, wrapper) {
  const make = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
  const emit = value => { control.value = value; control.dispatchEvent(new Event('input', { bubbles: true })); };
  if (key === 'emotionCustom') {
    control.hidden = true;
    const select = make('select'); select.setAttribute('aria-label', 'Emotion'); select.disabled = control.disabled;
    for (const v of new Set(['', 'Calm', 'Confident', 'Anxious', 'Frustrated', 'FOMO', 'Revenge', control.value])) {
      const option = make('option', v || 'Select'); option.value = v; select.append(option);
    }
    select.value = control.value; select.onchange = () => emit(select.value); wrapper.append(select);
  } else if (['confidenceRating', 'tradeRating'].includes(key)) {
    control.hidden = true; const row = make('div'); row.className = 'strategy-dots psychology-stars';
    const label = key === 'confidenceRating' ? 'Confidence' : 'Execution'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', label);
    const buttons = [];
    const draw = () => buttons.forEach((b,i) => { const filled = Number(control.value) >= i+1; b.textContent = filled ? '★' : '☆'; b.classList.toggle('filled', filled); b.setAttribute('aria-pressed', String(Number(control.value) === i+1)); });
    for (let i=1;i<=5;i++) { const b=make('button'); b.type='button'; b.setAttribute('aria-label', `${label}: ${i} of 5`); b.disabled=control.disabled; b.onclick=()=>{emit(String(Number(control.value)===i?0:i));draw();}; buttons.push(b);row.append(b); }
    draw();wrapper.append(row);
  } else if (choices[key]) {
    control.hidden = true;
    const selected = new Set(control.value.split(',').map(v => v.trim()).filter(Boolean));
    const picker = make('details'), title = make('summary'); picker.className = 'strategy-picker'; picker.append(title);
    const list = make('div'); list.className = 'strategy-options'; picker.append(list);
    const renderTitle = () => { title.textContent = [...selected].join(', ') || 'Select'; };
    const addOption = value => {
      const label = make('label'), box = make('input'); box.type = 'checkbox'; box.checked = selected.has(value); box.disabled = control.disabled;
      box.onchange = () => { if (box.checked) selected.add(value); else selected.delete(value); renderTitle(); emit([...selected].join(',')); };
      label.append(box, document.createTextNode(value)); list.append(label);
    };
    const available = new Set([...choices[key], ...selected]); available.forEach(addOption);
    const custom = make('input'); custom.type = 'text'; custom.placeholder = 'Custom option'; custom.setAttribute('aria-label', `Custom ${key === 'setupsSelectedRaw' ? 'setup' : key === 'timeframesSelectedRaw' ? 'timeframe' : 'mistake'}`); custom.maxLength = 100;
    const add = make('button', 'Add'); add.type = 'button'; add.className = 'text-button'; add.disabled = custom.disabled = control.disabled;
    add.onclick = () => { const v = custom.value.trim(); if (!v || v.includes(',')) { custom.setCustomValidity('Enter one option without commas.'); custom.reportValidity(); return; } custom.setCustomValidity(''); selected.add(v); if (!available.has(v)) { available.add(v); addOption(v); } else { for (const label of list.querySelectorAll('label')) if (label.textContent === v) label.querySelector('input').checked = true; } custom.value = ''; renderTitle(); emit([...selected].join(',')); };
    custom.oninput = () => custom.setCustomValidity('');
    list.append(custom, add); renderTitle(); wrapper.append(picker);
  } else if (key === 'confluences') {
    control.hidden = true; const row = make('div'); row.className = 'strategy-dots'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Confluences');
    const buttons = [];
    const draw = () => buttons.forEach((b,i) => { b.setAttribute('aria-pressed', String(Number(control.value) === i+1)); b.classList.toggle('filled', Number(control.value) >= i+1); });
    for (let i=1;i<=5;i++) { const b=make('button','●'); b.type='button'; b.setAttribute('aria-label', `${i} confluence${i===1?'':'s'}`); b.disabled=control.disabled; b.onclick=()=>{emit(String(Number(control.value)===i?0:i));draw();}; buttons.push(b); row.append(b); }
    draw(); wrapper.append(row);
  } else if (key === 'slMoved') {
    control.hidden = true; const label = make('label'), box=make('input'); box.setAttribute('aria-label', 'SL moved?'); box.type='checkbox'; box.checked=control.value==='true'; box.disabled=control.disabled; box.onchange=()=>emit(String(box.checked)); label.prepend(box); wrapper.append(label);
  }
}
