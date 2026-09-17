// MARK: - Regionale consumentenprijzen
export const REGION_KEY = 'pulseos.appStoreRegion';
export const FALLBACK = 'Check price in the app';

export function validRegion(value, regions) {
  return regions.includes(value) ? value : 'Netherlands';
}

export function readRegion(regions) {
  try { return validRegion(window.localStorage.getItem(REGION_KEY), regions); }
  catch { return 'Netherlands'; }
}

export function formatPrice(entry) {
  if (!entry || typeof entry.price !== 'string' || !/^\d+(?:\.\d+)?$/.test(entry.price)
      || !/^[A-Z]{3}$/.test(entry.currency) || !Number.isFinite(Number(entry.price))) return FALLBACK;
  try {
    // Comment NL: Valutacodes maken alle dollarvaluta's ondubbelzinnig; Intl bepaalt decimalen.
    return new Intl.NumberFormat('en', {
      style: 'currency', currency: entry.currency, currencyDisplay: 'code'
    }).format(Number(entry.price));
  } catch { return FALLBACK; }
}

// MARK: - Doorzoekbare regiokeuze
// Comment NL: Alleen een bevestigde bronregio verandert de prijzen; zoektekst blijft tijdelijk.
function createRegionPicker(regions, id, onSelect) {
  const field = document.createElement('div');
  field.className = 'region-picker';
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-list`);
  input.placeholder = 'Search countries or regions';
  const popup = document.createElement('div');
  popup.className = 'region-popup';
  popup.hidden = true;
  const list = document.createElement('div');
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Countries or regions');
  const empty = document.createElement('div');
  empty.className = 'region-empty';
  empty.setAttribute('role', 'status');
  popup.append(list, empty);
  field.append(input, popup);
  let selected = '';
  let matches = regions;
  let active = -1;
  const normalize = value => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function close() {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    input.value = selected;
  }

  function highlight() {
    [...list.children].forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
    const option = list.children[active];
    if (option) {
      input.setAttribute('aria-activedescendant', option.id);
      // Comment NL: Alleen de optielijst scrollt; de pagina en het zoekveld blijven op hun plek.
      const top = option.offsetTop;
      if (top < popup.scrollTop) popup.scrollTop = top;
      else if (top + option.offsetHeight > popup.scrollTop + popup.clientHeight) {
        popup.scrollTop = top + option.offsetHeight - popup.clientHeight;
      }
    } else input.removeAttribute('aria-activedescendant');
  }

  function show(query = '') {
    matches = regions.filter(name => normalize(name).includes(normalize(query)));
    const exact = matches.findIndex(name => normalize(name) === normalize(query));
    active = query ? (exact >= 0 ? exact : matches.length ? 0 : -1) : matches.indexOf(selected);
    list.replaceChildren();
    matches.forEach((name, index) => {
      const option = document.createElement('div');
      option.id = `${id}-option-${index}`;
      option.setAttribute('role', 'option');
      option.textContent = name;
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => onSelect(name));
      list.append(option);
    });
    empty.textContent = matches.length ? '' : 'No matching regions. Try another name.';
    empty.hidden = matches.length > 0;
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight();
  }

  input.addEventListener('focus', () => { input.value = ''; show(); });
  input.addEventListener('click', () => {
    if (popup.hidden) { input.value = ''; show(); }
  });
  input.addEventListener('input', () => show(input.value));
  input.addEventListener('blur', () => {
    // Comment NL: Uitstellen zodat een klik/tik op een optie (die in sommige
    // browsers vóór deze blur kan komen) eerst de kans krijgt om af te ronden —
    // anders sluit dit de lijst al voordat de klik op de optie kan vuren.
    window.setTimeout(() => {
      if (popup.hidden) return;
      const exact = regions.find(name => normalize(name) === normalize(input.value));
      if (exact && exact !== selected) onSelect(exact);
      else close();
    }, 0);
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden) show();
      else {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        active = matches.length ? (active + direction + matches.length) % matches.length : -1;
        highlight();
      }
    } else if (event.key === 'Enter' && !popup.hidden) {
      event.preventDefault();
      if (matches[active]) onSelect(matches[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
      input.select();
    }
  });
  return { field, input, setValue(value) { selected = value; close(); } };
}

// MARK: - Gedeelde regiokeuze
export async function initPricing() {
  const sections = [...document.querySelectorAll('[data-pricing-app]')];
  if (!sections.length) return;
  let data;
  try {
    const response = await fetch('/data/prices.json');
    if (!response.ok) return;
    data = await response.json();
    if (!Array.isArray(data.regions) || !data.regions.includes('Netherlands')
        || !data.regions.every(region => typeof region === 'string' && region.length)
        || !data.products || typeof data.products !== 'object') return;
  } catch { return; }

  let region = readRegion(data.regions);
  const selectors = [];
  function render() {
    for (const selector of selectors) selector.setValue(region);
    for (const section of sections) {
      for (const price of section.querySelectorAll('[data-price-plan]')) {
        const entry = data.products[section.dataset.pricingApp]?.[price.dataset.pricePlan]?.[region];
        price.textContent = formatPrice(entry);
        price.classList.toggle('price-unavailable', price.textContent === FALLBACK);
      }
      section.querySelector('[data-price-status]').textContent = `Prices for ${region}.`;
    }
  }

  sections.forEach((section, index) => {
    const control = document.createElement('div');
    control.className = 'app-store-region';
    const label = document.createElement('label');
    label.htmlFor = `app-store-region-${index}`;
    label.textContent = 'App Store region';
    const help = document.createElement('p');
    help.id = `app-store-region-help-${index}`;
    help.textContent = 'Choose the country or region of your App Store account. Type to search.';
    const picker = createRegionPicker(data.regions, label.htmlFor, name => {
      region = validRegion(name, data.regions);
      try { window.localStorage.setItem(REGION_KEY, region); } catch { /* Comment NL: Zonder opslag blijft kiezen werken. */ }
      render();
    });
    picker.input.setAttribute('aria-describedby', help.id);
    selectors.push(picker);
    control.append(label, picker.field, help);
    section.querySelector('[data-price-grid]').before(control);
  });
  render();

  // Comment NL: Andere tabbladen en terugnavigatie gebruiken dezelfde opgeslagen keuze.
  window.addEventListener('storage', event => {
    if (event.key === REGION_KEY || event.key === null) { region = readRegion(data.regions); render(); }
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { region = readRegion(data.regions); render(); }
  });
}

if (typeof document !== 'undefined') initPricing();
