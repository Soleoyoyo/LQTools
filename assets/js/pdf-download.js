"use strict";

/** Small dependency-free PDF writer: A4, multipage, downloadable on mobile.
 * All generated text is escaped and transliterated to ASCII for the standard
 * PDF Helvetica font. Browser network connectivity is not required.
 */
window.LQPdfDownload = (() => {
    const W = 595;
    const H = 842;
    const M = 42;
    const rowsPerPage = 32;

    function ascii(value) {
        return String(value)
            .replace(/[\u2013\u2014]/g, "-")
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201c\u201d]/g, '"')
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\x20-\x7E]/g, "?");
    }

    function pdfText(value) {
        return `(${ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
    }

    function safeFileName(value) {
        return ascii(value).replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 65) || "Game";
    }

    function createTicketReport(result, gameName) {
        const pages = [];
        let commands;
        const money = value => `$${Number(value).toFixed(2)}`;
        const fmt = number => Number(number).toLocaleString("en-AU", { maximumFractionDigits: 2 });
        const timestamp = new Date().toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });

        function rect(x, yTop, width, height, r, g, b) {
            commands.push(`${r} ${g} ${b} rg ${x} ${H - yTop - height} ${width} ${height} re f`);
        }

        function text(txt, x, yTop, size = 10, bold = false, color = "0.13 0.13 0.13") {
            const font = bold ? "F2" : "F1";
            commands.push(`${color} rg BT /${font} ${size} Tf 1 0 0 1 ${x} ${H - yTop} Tm ${pdfText(txt)} Tj ET`);
        }

        function beginPage(pageNumber) {
            commands = [];
            pages.push(commands);
            rect(0, 0, W, 8, 0.89, 0.105, 0.137);
            text("LQ  /  LASERQUEST", M, 37, 12, true);
            text("TICKET PAYOUT TEST REPORT", M, 61, 17, true);
            text(`Game: ${ascii(gameName).slice(0, 75)}`, M, 83, 10, true);
            text(`Created: ${timestamp}`, M, 100, 9, false, "0.42 0.42 0.42");
            rect(M, 810, W - 2 * M, 0.8, 0.82, 0.82, 0.82);
            text("Ticket value: AUD $0.01 each. Results are indicative of the test sample.", M, 824, 8, false, "0.42 0.42 0.42");
            text(`Page ${pageNumber}`, W - 94, 824, 8, false, "0.42 0.42 0.42");
        }

        beginPage(1);
        rect(M, 119, W - 2 * M, 138, 0.965, 0.965, 0.965);
        const summary = [
            ["Price per play", money(result.price), "Test plays", fmt(result.count)],
            ["Total tickets", fmt(result.totalTickets), "Average tickets / play", fmt(result.averageTickets)],
            ["Average value / play", money(result.averageTicketValue), "Payout percentage", `${result.percentage.toFixed(2)}%`],
            ["Total test revenue", money(result.totalRevenue), "Total ticket value", money(result.totalTicketValue)]
        ];
        summary.forEach((line, i) => {
            const y = 142 + i * 30;
            text(line[0], M + 12, y, 9);
            text(line[1], M + 170, y, 9, true);
            text(line[2], M + 257, y, 9);
            text(line[3], M + 418, y, 9, true);
        });
        text("INDIVIDUAL PLAY RESULTS", M, 285, 11, true);

        function tableHeader(y) {
            rect(M, y, W - 2 * M, 27, 0.12, 0.12, 0.12);
            text("PLAY", M + 12, y + 18, 9, true, "1 1 1");
            text("TICKETS WON", M + 190, y + 18, 9, true, "1 1 1");
            text("TICKET VALUE (AUD)", M + 355, y + 18, 9, true, "1 1 1");
        }

        let pageIndex = 1;
        let y = 295;
        tableHeader(y);
        y += 27;

        result.tickets.forEach((tickets, i) => {
            if (y > 762) {
                pageIndex++;
                beginPage(pageIndex);
                y = 126;
                tableHeader(y);
                y += 27;
            }
            if (i % 2 === 0) rect(M, y, W - 2 * M, 16, 0.97, 0.97, 0.97);
            text(String(i + 1), M + 12, y + 12, 9);
            text(fmt(tickets), M + 190, y + 12, 9);
            text(money(tickets * 0.01), M + 355, y + 12, 9);
            y += 16;
        });

        // Generate a standards-compliant PDF with byte-accurate xref offsets.
        const objects = [null];
        function add(value) { objects.push(value); return objects.length - 1; }
        const catalogId = add("");
        const pagesId = add("");
        const fontRegularId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
        const fontBoldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
        const ids = [];
        pages.forEach(page => {
            const stream = page.join("\n") + "\n";
            const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
            const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
            ids.push(pageId);
        });
        objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
        objects[pagesId] = `<< /Type /Pages /Kids [${ids.map(id => `${id} 0 R`).join(" ")}] /Count ${ids.length} >>`;

        let pdf = "%PDF-1.4\n";
        const offsets = [0];
        for (let i = 1; i < objects.length; i++) {
            offsets.push(pdf.length);
            pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
        }
        const xref = pdf.length;
        pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
        for (let i = 1; i < objects.length; i++) {
            pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
        }
        pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        return new Blob([pdf], { type: "application/pdf" });
    }

    function download(blob, gameName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeFileName(gameName)} - Ticket Payout Report.pdf`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Allow the mobile browser time to start consuming the blob.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    return { createTicketReport, download };
})();
