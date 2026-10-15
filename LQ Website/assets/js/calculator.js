'use strict';

/**
 * LQ Tools — Game Settings Calculator
 *
 * Every prize's vending price is added together to produce ONE machine setting.
 * VIP price = normal play price × 0.90.
 * Multiplier = 100 / desired payout percentage.
 * A decimal portion of 0.30 or less rounds down; anything higher rounds up.
 */

const element = (id) => document.getElementById(id);

const normalInput = element('normalPrice');
const payoutInput = element('payoutPercentage');
const prizeList = element('prizeList');
const prizeSummary = element('prizeSummaryList');
const prizeTemplate = element('prizeEntryTemplate');

const VIP_DISCOUNT_FACTOR = 0.90;
const ROUNDING_THRESHOLD = 0.30;
const ROUNDING_TOLERANCE = 1e-10;

let nextPrizeId = 1;
let prizes = [];

const moneyFormatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD'
});

function formatMoney(value) {
    return moneyFormatter.format(value);
}

function readNumber(value) {
    return String(value).trim() === '' ? NaN : Number(value);
}

function roundSetting(value) {
    const whole = Math.floor(value);
    const fraction = value - whole;

    return fraction > ROUNDING_THRESHOLD + ROUNDING_TOLERANCE
        ? whole + 1
        : whole;
}

function closeHelp() {
    document.querySelectorAll('.help-container.is-open').forEach((container) => {
        container.classList.remove('is-open');
    });

    document.querySelectorAll('.help-button[aria-expanded="true"]').forEach((button) => {
        button.setAttribute('aria-expanded', 'false');
    });
}

function refreshPrizeNumbers() {
    [...prizeList.children].forEach((row, index) => {
        row.querySelector('.prize-index').textContent = `PRIZE ${index + 1}`;
        row.querySelector('.remove-prize').hidden = prizes.length === 1;
    });

    element('prizeCount').textContent =
        `${prizes.length} ${prizes.length === 1 ? 'PRIZE' : 'PRIZES'}`;
}

function addPrize(name = '', price = '') {
    const id = nextPrizeId++;
    prizes.push({ id, name, price: String(price) });

    // The markup and vending-price help text are maintained in game-settings.html.
    const fragment = prizeTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.prize-entry');
    row.dataset.id = String(id);

    const nameInput = row.querySelector('.prize-name');
    const priceInput = row.querySelector('.prize-price');
    const tooltip = row.querySelector('.help-tooltip');
    const tooltipButton = row.querySelector('.help-button');

    nameInput.id = `prizeName-${id}`;
    priceInput.id = `prizePrice-${id}`;
    tooltip.id = `prizeHelp-${id}`;

    row.querySelector('.prize-name-label').htmlFor = nameInput.id;
    row.querySelector('.prize-price-label').htmlFor = priceInput.id;
    tooltipButton.setAttribute('aria-controls', tooltip.id);
    tooltipButton.setAttribute('aria-expanded', 'false');

    nameInput.value = name;
    priceInput.value = String(price);
    prizeList.append(fragment);

    // Animate only newly added rows, not the initial default prize.
    if (prizes.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        row.classList.add('is-new');
        row.addEventListener('animationend', () => {
            row.classList.remove('is-new');
        }, { once: true });
    }

    refreshPrizeNumbers();
    calculate();

    return prizeList.lastElementChild;
}

function renderPrizeSummary() {
    prizeSummary.replaceChildren();

    prizes.forEach((prize, index) => {
        const row = document.createElement('div');
        row.className = 'summary-row';

        const name = document.createElement('span');
        name.textContent = prize.name.trim() || `Prize ${index + 1}`;

        const price = document.createElement('strong');
        const value = readNumber(prize.price);
        price.textContent = Number.isFinite(value) && value >= 0
            ? formatMoney(value)
            : '—';

        row.append(name, price);
        prizeSummary.append(row);
    });
}

function invalidate(message) {

    const error = element('errorMessage');
    error.textContent = message;
    error.hidden = false;

    [
        'settingsValue',
        'totalVendingPrice',
        'vipPrice',
        'payoutMultiplier',
        'rawSetting'
    ].forEach((id) => {
        element(id).textContent = '—';
    });

}

function calculate() {
    renderPrizeSummary();

    const normalPrice = readNumber(normalInput.value);
    const payout = readNumber(payoutInput.value);

    if (!Number.isFinite(normalPrice) || normalPrice <= 0) {
        invalidate('Normal play price must be greater than $0.');
        return;
    }

    if (!Number.isFinite(payout) || payout <= 0 || payout > 100) {
        invalidate('Payout percentage must be greater than 0 and at most 100.');
        return;
    }

    // Add prize prices in cents to minimise floating-point summation errors.
    let totalCents = 0;

    for (const prize of prizes) {
        const price = readNumber(prize.price);

        if (!Number.isFinite(price) || price < 0) {
            invalidate('Enter a valid vending price for every prize.');
            return;
        }

        totalCents += Math.round((price + Number.EPSILON) * 100);
    }

    const totalVendingPrice = totalCents / 100;
    const vipPrice = normalPrice * VIP_DISCOUNT_FACTOR;
    const payoutMultiplier = 100 / payout;
    const rawSetting = (totalVendingPrice * payoutMultiplier) / vipPrice;
    const roundedSetting = roundSetting(rawSetting);

    if (
        !Number.isFinite(totalVendingPrice) ||
        !Number.isFinite(rawSetting) ||
        !Number.isSafeInteger(roundedSetting)
    ) {
        invalidate('Calculation is outside the supported range.');
        return;
    }

    element('errorMessage').hidden = true;
    element('errorMessage').textContent = '';
    const settingDisplay = element('settingsValue');
    const changed = settingDisplay.textContent.trim() !== String(roundedSetting);
    settingDisplay.textContent = String(roundedSetting);

    if (changed && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        settingDisplay.classList.remove('value-updated');
        // Restart the animation when successive edits change the value.
        void settingDisplay.offsetWidth;
        settingDisplay.classList.add('value-updated');
    }
    element('totalVendingPrice').textContent = formatMoney(totalVendingPrice);
    element('vipPrice').textContent = formatMoney(vipPrice);
    element('payoutMultiplier').textContent = `${payoutMultiplier.toFixed(2)}×`;
    element('rawSetting').textContent = rawSetting.toFixed(2);
}

// Add and remove prizes without recreating the rest of the form.
element('addPrizeButton').addEventListener('click', () => {
    addPrize().querySelector('.prize-name').focus();
});

prizeList.addEventListener('input', (event) => {
    const row = event.target.closest('.prize-entry');
    if (!row) return;

    const prize = prizes.find((item) => item.id === Number(row.dataset.id));
    if (!prize) return;

    prize.name = row.querySelector('.prize-name').value;
    prize.price = row.querySelector('.prize-price').value;
    calculate();
});

prizeList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-prize');
    if (!removeButton || prizes.length <= 1) return;

    const row = removeButton.closest('.prize-entry');
    const id = Number(row.dataset.id);

    prizes = prizes.filter((prize) => prize.id !== id);
    row.remove();
    refreshPrizeNumbers();
    calculate();
});

normalInput.addEventListener('input', calculate);
payoutInput.addEventListener('input', calculate);

element('calculatorForm').addEventListener('submit', (event) => {
    event.preventDefault();
    calculate();
});

element('resetButton').addEventListener('click', () => {
    normalInput.value = '';
    payoutInput.value = '';
    prizes = [];
    nextPrizeId = 1;

    prizeList.replaceChildren();
    closeHelp();
    addPrize('', '');
});

// Clicking or tapping a help icon toggles its tooltip.
document.addEventListener('click', (event) => {
    const button = event.target.closest('.help-button');

    if (button) {
        const container = button.closest('.help-container');
        const wasOpen = container.classList.contains('is-open');
        closeHelp();

        if (!wasOpen) {
            container.classList.add('is-open');
            button.setAttribute('aria-expanded', 'true');
        } else {
            button.blur();
        }
    } else if (!event.target.closest('.help-container')) {
        closeHelp();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    closeHelp();
    if (document.activeElement?.matches('.help-button')) {
        document.activeElement.blur();
    }
});

// Start with one empty prize; all values are entered by the user.
addPrize('', '');
