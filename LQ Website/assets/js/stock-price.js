/*
 * LQ Hub — Stock Price Calculator
 *
 * Landed cost: (purchase price + shipping) × AUD per foreign unit.
 * Per-item cost: converted landed total / number of items in pack.
 * Vending price: per-item AUD cost × 1.30.
 * Ticket price: per-item AUD cost × 165.
 * Displayed AUD money values round to the nearest $0.10.
 * Tickets: nearest 10 under 500, nearest 50 for 500–2500, nearest 100 above 2500.
 *
 * The API provides reference rates, not necessarily the actual rate
 * charged by a bank or supplier. Users can edit the conversion rate.
 */

"use strict";

const form = document.getElementById("stockPriceForm");
const itemNameInput = document.getElementById("itemName");
const purchasePriceInput = document.getElementById("purchasePrice");
const shippingCostInput = document.getElementById("shippingCost");
const shippingCurrencySymbol = document.getElementById("shippingCurrencySymbol");
const currencyInput = document.getElementById("purchaseCurrency");
const currencySymbol = document.getElementById("currencySymbol");
const quantityInput = document.getElementById("packQuantity");
const exchangePanel = document.getElementById("exchangePanel");
const exchangeRateInput = document.getElementById("exchangeRate");
const exchangeStatus = document.getElementById("exchangeStatus");
const refreshRateButton = document.getElementById("refreshRate");
const errorOutput = document.getElementById("stockError");
const resetButton = document.getElementById("stockReset");

const resultElements = {
    vending: document.getElementById("vendingResult"),
    tickets: document.getElementById("ticketResult"),
    original: document.getElementById("originalResult"),
    shipping: document.getElementById("shippingResult"),
    converted: document.getElementById("convertedResult"),
    quantity: document.getElementById("quantityResult"),
    unitCost: document.getElementById("unitCostResult"),
    name: document.getElementById("resultItemName")
};

const CURRENCY_SYMBOLS = {
    AUD: "$",
    USD: "$",
    GBP: "£",
    EUR: "€"
};

const AUD_FORMAT = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const TICKET_FORMAT = new Intl.NumberFormat("en-AU", {
    maximumFractionDigits: 0
});

/** Round to nearest 10 Australian cents; halfway rounds upwards. */
function roundAUD(value) {
    return Math.round((value + Number.EPSILON) * 10) / 10;
}

/** Select the ticket increment from the unrounded ticket amount. */
function roundTickets(value) {
    const increment = value < 500 ? 10 : value <= 2500 ? 50 : 100;
    return Math.round(value / increment) * increment;
}

// Store successfully fetched rates for the current page session.
const rateCache = new Map();
let latestRateRequest = 0;
let rateController = null;
let lastDisplayed = "";

function currencyMoney(value, currency) {
    return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency,
        currencyDisplay: "symbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function readNumber(input) {
    return input.value.trim() === "" ? NaN : Number(input.value);
}

function setError(message) {
    errorOutput.textContent = message;
    errorOutput.hidden = !message;
}

function clearResults(message) {
    for (const key of ["vending", "tickets", "original", "shipping", "converted", "quantity", "unitCost"]) {
        resultElements[key].textContent = "—";
    }

    resultElements.name.textContent = message || "Per-item prices in Australian dollars.";
    lastDisplayed = "";
}

function animateUpdatedValues(signature) {
    if (signature === lastDisplayed) return;
    lastDisplayed = signature;

    document.querySelectorAll(".stock-big-result").forEach(card => {
        card.classList.remove("is-updated");
        // Restart the short transition when the displayed numbers change.
        void card.offsetWidth;
        card.classList.add("is-updated");
    });
}

function calculate() {
    const purchase = readNumber(purchasePriceInput);
    // Empty shipping means no shipping charge (AUD 0).
    const shipping = shippingCostInput.value.trim() === ""
        ? 0
        : readNumber(shippingCostInput);
    const quantity = readNumber(quantityInput);
    const currency = currencyInput.value;
    const rate = currency === "AUD" ? 1 : readNumber(exchangeRateInput);

    if (!Number.isFinite(purchase) || purchase <= 0) {
        setError("Enter a purchase price greater than zero.");
        clearResults();
        return;
    }

    if (!Number.isFinite(shipping) || shipping < 0) {
        setError("Enter a shipping cost of zero or more.");
        clearResults();
        return;
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
        setError("Enter a whole-number pack quantity of at least 1.");
        clearResults();
        return;
    }

    if (!Number.isFinite(rate) || rate <= 0) {
        setError(currency === "AUD"
            ? "Exchange rate is invalid."
            : "Enter a valid AUD exchange rate, or press Refresh to load one.");
        clearResults(currency === "AUD" ? "" : "Waiting for a valid exchange rate.");
        return;
    }

    const totalAUD = (purchase + shipping) * rate;
    const unitAUD = totalAUD / quantity;
    const vending = unitAUD * 1.30;
    const tickets = unitAUD * 165;
    const roundedVending = roundAUD(vending);
    const roundedTickets = roundTickets(tickets);

    if (![totalAUD, unitAUD, vending, tickets, roundedVending, roundedTickets].every(Number.isFinite) ||
        !Number.isSafeInteger(roundedTickets)) {
        setError("The calculation is outside the supported range.");
        clearResults();
        return;
    }

    setError("");
    resultElements.original.textContent = currencyMoney(purchase, currency);
    resultElements.shipping.textContent = currencyMoney(shipping, currency);
    resultElements.converted.textContent = AUD_FORMAT.format(roundAUD(totalAUD));
    resultElements.quantity.textContent = quantity.toLocaleString("en-AU");
    resultElements.unitCost.textContent = AUD_FORMAT.format(roundAUD(unitAUD));
    resultElements.vending.textContent = AUD_FORMAT.format(roundedVending);
    resultElements.tickets.textContent = TICKET_FORMAT.format(roundedTickets);

    const name = itemNameInput.value.trim();
    resultElements.name.textContent = name
        ? `${name} — price per individual item.`
        : "Per-item prices in Australian dollars.";

    animateUpdatedValues(`${roundedVending}|${roundedTickets}`);
}

/**
 * Uses Frankfurter's public reference rate API (no API key).
 * A failed fetch leaves a blank editable field rather than guessing a rate.
 */
async function fetchRate(force = false) {
    const currency = currencyInput.value;
    latestRateRequest++;
    const requestId = latestRateRequest;

    if (rateController) {
        rateController.abort();
        rateController = null;
    }

    if (currency === "AUD") {
        exchangePanel.hidden = true;
        exchangeRateInput.value = "1";
        calculate();
        return;
    }

    exchangePanel.hidden = false;

    if (!force && rateCache.has(currency)) {
        const cached = rateCache.get(currency);
        exchangeRateInput.value = String(cached.rate);
        exchangeStatus.textContent = `Reference rate dated ${cached.date}. Editable if your supplier rate differs.`;
        calculate();
        return;
    }

    // Do not use a leftover rate for the previously selected currency.
    exchangeRateInput.value = "";
    exchangeStatus.textContent = `Loading ${currency} → AUD reference rate…`;
    refreshRateButton.disabled = true;
    calculate();

    const controller = new AbortController();
    rateController = controller;

    try {
        const response = await fetch(
            `https://api.frankfurter.dev/v2/rate/${currency.toLowerCase()}/aud`,
            { signal: controller.signal }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Number.isFinite(data.rate) || data.rate <= 0) {
            throw new Error("Invalid exchange rate response");
        }

        if (requestId !== latestRateRequest || currencyInput.value !== currency) return;
        rateCache.set(currency, { rate: data.rate, date: data.date });
        exchangeRateInput.value = String(data.rate);
        exchangeStatus.textContent = `Reference rate dated ${data.date}. Editable if your supplier rate differs.`;
        calculate();
    } catch (error) {
        if (requestId !== latestRateRequest) return;
        if (error.name === "AbortError") return;

        exchangeStatus.textContent = "Could not load an exchange rate. Enter the AUD rate manually.";
        calculate();
    } finally {
        if (requestId === latestRateRequest) {
            refreshRateButton.disabled = false;
            rateController = null;
        }
    }
}

currencyInput.addEventListener("change", () => {
    currencySymbol.textContent = CURRENCY_SYMBOLS[currencyInput.value];
    shippingCurrencySymbol.textContent = CURRENCY_SYMBOLS[currencyInput.value];
    fetchRate();
});

refreshRateButton.addEventListener("click", () => fetchRate(true));

exchangeRateInput.addEventListener("input", () => {
    exchangeStatus.textContent = "Using your manually entered AUD exchange rate.";
    calculate();
});

for (const input of [itemNameInput, purchasePriceInput, shippingCostInput, quantityInput]) {
    input.addEventListener("input", calculate);
}

form.addEventListener("submit", event => {
    event.preventDefault();
    calculate();
});

resetButton.addEventListener("click", () => {
    if (rateController) rateController.abort();
    latestRateRequest++;
    rateController = null;
    refreshRateButton.disabled = false;

    itemNameInput.value = "";
    purchasePriceInput.value = "";
    shippingCostInput.value = "";
    quantityInput.value = "";
    currencyInput.value = "AUD";
    currencySymbol.textContent = "$";
    shippingCurrencySymbol.textContent = "$";
    exchangeRateInput.value = "1";
    exchangePanel.hidden = true;
    setError("");
    calculate();
});

// Start with cleared purchase fields and AUD selected.
resetButton.click();

// Shared help pattern: click/tap to pin a tooltip, click outside or Escape to close.
function closeStockTooltips() {
    document.querySelectorAll(".stock-help").forEach(container => {
        container.classList.remove("is-open");
        const button = container.querySelector(".stock-help-button");
        if (button) button.setAttribute("aria-expanded", "false");
    });
}

document.addEventListener("click", event => {
    const helpButton = event.target.closest(".stock-help-button");
    if (helpButton) {
        const container = helpButton.closest(".stock-help");
        const wasOpen = container.classList.contains("is-open");
        closeStockTooltips();
        if (!wasOpen) {
            container.classList.add("is-open");
            helpButton.setAttribute("aria-expanded", "true");
        } else {
            helpButton.blur();
        }
        return;
    }
    if (!event.target.closest(".stock-help")) closeStockTooltips();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeStockTooltips();
        if (document.activeElement.matches(".stock-help-button")) {
            document.activeElement.blur();
        }
    }
});
