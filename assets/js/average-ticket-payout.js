"use strict";

/**
 * Average Ticket Payout Calculator
 * Each test play receives one ticket count; all entries form one average.
 * Ticket value is fixed at AUD $0.01 for payout calculations.
 */

const TICKET_VALUE_AUD = 0.01;
const MAX_PLAYS = 250;

const gameNameInput = document.getElementById("gameName");
const exportPdfButton = document.getElementById("exportPdfButton");
const playPriceInput = document.getElementById("playPrice");
const playCountInput = document.getElementById("playCount");
const ticketEntries = document.getElementById("ticketEntries");
const ticketTemplate = document.getElementById("ticketEntryTemplate");
const addPlayButton = document.getElementById("addPlayButton");
const payoutForm = document.getElementById("payoutForm");
const resetButton = document.getElementById("resetPayout");
const errorOutput = document.getElementById("payoutError");

const outputs = {
    average: document.getElementById("averageTickets"),
    percentage: document.getElementById("payoutPercentage"),
    plays: document.getElementById("resultPlays"),
    totalTickets: document.getElementById("totalTickets"),
    averageValue: document.getElementById("averageValue"),
    price: document.getElementById("resultPrice"),
    revenue: document.getElementById("totalRevenue"),
    ticketValue: document.getElementById("totalTicketValue")
};

const aud = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
});

const number = new Intl.NumberFormat("en-AU", {
    maximumFractionDigits: 2
});

function appendPlay(initialValue = "") {
    const row = ticketTemplate.content.firstElementChild.cloneNode(true);
    const input = row.querySelector(".ticket-input");
    const index = ticketEntries.children.length + 1;

    input.id = `ticket-play-${index}`;
    input.value = initialValue;
    row.querySelector(".ticket-entry-label").htmlFor = input.id;
    row.querySelector(".ticket-entry-label").textContent = `PLAY ${index}`;
    row.classList.add("is-new");

    ticketEntries.appendChild(row);
    return input;
}

function setPlayCount(count) {
    const existing = ticketEntries.children.length;

    if (count > existing) {
        for (let index = existing; index < count; index++) {
            appendPlay();
        }
    } else if (count < existing) {
        // Keep ticket values in the remaining rows.
        while (ticketEntries.children.length > count) {
            ticketEntries.lastElementChild.remove();
        }
    }

    playCountInput.value = String(count);
    addPlayButton.disabled = count >= MAX_PLAYS;
    calculate();
}

function showError(message) {
    errorOutput.textContent = message;
    errorOutput.hidden = false;
}

function clearError() {
    errorOutput.hidden = true;
    errorOutput.textContent = "";
}

function clearOutputs() {
    Object.values(outputs).forEach(element => {
        element.textContent = "—";
    });
}

function updateText(element, value) {
    const next = String(value);
    const changed = element.textContent !== next;
    element.textContent = next;

    if (changed && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        element.classList.remove("value-updated");
        void element.offsetWidth;
        element.classList.add("value-updated");
    }
}

function calculate() {
    const priceText = playPriceInput.value.trim();
    const price = Number(priceText);
    const values = [...ticketEntries.querySelectorAll(".ticket-input")];
    const count = values.length;

    if (priceText === "" || !Number.isFinite(price) || price <= 0) {
        showError("Enter a valid price of play greater than $0.");
        clearOutputs();
        return null;
    }

    let totalTickets = 0;

    for (const [index, input] of values.entries()) {
        const raw = input.value.trim();
        const tickets = Number(raw);

        if (raw === "" || !Number.isSafeInteger(tickets) || tickets < 0) {
            showError(`Enter a whole number of tickets for play ${index + 1} (zero is allowed).`);
            clearOutputs();
            return;
        }

        totalTickets += tickets;
    }

    if (!count || !Number.isSafeInteger(totalTickets)) {
        showError("Add at least one valid test play.");
        clearOutputs();
        return null;
    }

    const averageTickets = totalTickets / count;
    const averageTicketValue = averageTickets * TICKET_VALUE_AUD;
    const totalRevenue = price * count;
    const totalTicketValue = totalTickets * TICKET_VALUE_AUD;
    const percentage = (averageTicketValue / price) * 100;

    if (![averageTickets, averageTicketValue, totalRevenue, totalTicketValue, percentage]
        .every(Number.isFinite)) {
        showError("The calculated values are too large. Please reduce the inputs.");
        clearOutputs();
        return null;
    }

    clearError();
    updateText(outputs.average, number.format(averageTickets));
    updateText(outputs.percentage, `${percentage.toFixed(2)}%`);
    outputs.plays.textContent = number.format(count);
    outputs.totalTickets.textContent = number.format(totalTickets);
    outputs.averageValue.textContent = aud.format(averageTicketValue);
    outputs.price.textContent = aud.format(price);
    outputs.revenue.textContent = aud.format(totalRevenue);
    outputs.ticketValue.textContent = aud.format(totalTicketValue);

    return {
        price,
        count,
        tickets: values.map(input => Number(input.value)),
        totalTickets,
        averageTickets,
        averageTicketValue,
        totalRevenue,
        totalTicketValue,
        percentage
    };
}

playCountInput.addEventListener("change", () => {
    const raw = playCountInput.value.trim();
    const requested = Number(raw);

    if (raw === "" || !Number.isSafeInteger(requested) || requested < 1 || requested > MAX_PLAYS) {
        showError(`Enter a whole number of plays between 1 and ${MAX_PLAYS}.`);
        playCountInput.value = String(ticketEntries.children.length);
        return;
    }

    setPlayCount(requested);
});

addPlayButton.addEventListener("click", () => {
    if (ticketEntries.children.length >= MAX_PLAYS) return;
    setPlayCount(ticketEntries.children.length + 1);
    ticketEntries.lastElementChild.querySelector("input").focus();
});

playPriceInput.addEventListener("input", calculate);
ticketEntries.addEventListener("input", calculate);

payoutForm.addEventListener("submit", event => {
    event.preventDefault();
    calculate();
});

resetButton.addEventListener("click", () => {
    gameNameInput.value = "";
    playPriceInput.value = "";
    ticketEntries.replaceChildren();
    for (let i = 0; i < 5; i++) {
        appendPlay("");
    }
    playCountInput.value = "5";
    addPlayButton.disabled = false;
    calculate();
});

// Build a dedicated print report using the actual test results.
// Browser print allows saving a multipage PDF with no internet or PDF library.
function preparePdfReport(result, gameName) {
    const timestamp = new Intl.DateTimeFormat("en-AU", {
        dateStyle: "long",
        timeStyle: "short"
    }).format(new Date());

    const reportFields = {
        reportGameName: gameName,
        reportDate: `Exported ${timestamp}`,
        reportPlayPrice: aud.format(result.price),
        reportPlayCount: number.format(result.count),
        reportTotalTickets: number.format(result.totalTickets),
        reportAverageTickets: number.format(result.averageTickets),
        reportAverageValue: aud.format(result.averageTicketValue),
        reportPayoutPercentage: `${result.percentage.toFixed(2)}%`,
        reportRevenue: aud.format(result.totalRevenue),
        reportTicketValue: aud.format(result.totalTicketValue)
    };

    for (const [id, text] of Object.entries(reportFields)) {
        document.getElementById(id).textContent = text;
    }

    const reportRows = document.getElementById("reportTicketRows");
    const fragment = document.createDocumentFragment();

    for (const [index, tickets] of result.tickets.entries()) {
        const row = document.createElement("tr");

        for (const value of [
            String(index + 1),
            number.format(tickets),
            aud.format(tickets * TICKET_VALUE_AUD)
        ]) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        }

        fragment.appendChild(row);
    }

    reportRows.replaceChildren(fragment);
}

exportPdfButton.addEventListener("click", () => {
    const name = gameNameInput.value.trim();

    if (!name) {
        showError("Enter the game name before exporting a PDF report.");
        gameNameInput.focus();
        return;
    }

    const result = calculate();
    if (!result) return;

    preparePdfReport(result, name);

    // The print dialog uses the page title as the suggested PDF name.
    const originalTitle = document.title;
    document.title = `${name.replace(/[\\/:*?"<>|]/g, "-")} - Ticket Payout Report`;

    // Print after the report has been added to the DOM.
    window.print();
    document.title = originalTitle;
});

function closeTooltips() {
    document.querySelectorAll(".payout-help").forEach(help => {
        help.classList.remove("is-open");
        help.querySelector(".payout-help-button").setAttribute("aria-expanded", "false");
    });
}

document.addEventListener("click", event => {
    const button = event.target.closest(".payout-help-button");

    if (button) {
        const help = button.closest(".payout-help");
        const wasOpen = help.classList.contains("is-open");
        closeTooltips();

        if (!wasOpen) {
            help.classList.add("is-open");
            button.setAttribute("aria-expanded", "true");
        } else {
            button.blur();
        }
        return;
    }

    if (!event.target.closest(".payout-help")) closeTooltips();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeTooltips();
        if (document.activeElement?.matches(".payout-help-button")) {
            document.activeElement.blur();
        }
    }
});

resetButton.click();
