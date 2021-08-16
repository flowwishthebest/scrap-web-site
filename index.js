'use strict';

const got = require('got');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const tableParser = require('cheerio-tableparser');
const excelJs = require('exceljs');

const url = 'https://immokoks.com';

async function loadHtml(url) {
    try {
        const res = await got(url);
        return res.body;
    } catch (err) {
        console.error('cant fetch html page', err);
        process.exit(1);
    }
}

function extractCars(html) {
    const $ = cheerio.load(html, null, false);

    return $('div[id^="comp-"] a').toArray()
        .filter((el) => el.attribs['aria-label'])
        .map((el) => ({
            name: el.attribs['aria-label'],
            link: el.attribs['href'],
        }));
}

async function getFullyLoadedHtml(browser, link) {
    const page = await browser.newPage();
    await page.goto(link);
    page.evaluate((_) => window.scrollBy(0, 1000));
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const html = await page.evaluate(
        () => document.querySelector('*').outerHTML,
    );
    await page.close();
    return html;
}

async function extractCarHtml(browser, car) {
    const srcTableHtml = await getFullyLoadedHtml(browser, car.link);
    
    const src = extractCarTableSrc(srcTableHtml);

    if (!src) {
        console.log(`cant fetch table src for ${car.name}`);
        return null;
    }

    const carTableHtml = await getFullyLoadedHtml(browser, src);

    return carTableHtml;
}

function extractCarTableSrc(html) {
    const $ = cheerio.load(html, null, false);

    const sources = $('div[id^="comp-"] iframe').toArray()
        .filter((el) => el.attribs['src'].startsWith('https://wix-visual'))
        .map((el) => el.attribs['src']);

    return sources[0];
}

function processCarTable(html) {
    const $ = cheerio.load(html, null, false);

    tableParser($);
    
    return $('table').parsetable();
}

async function main() {
    const html = await loadHtml(url);
    console.log('fetched html page');
    const cars = extractCars(html);
    console.log(`extracted ${cars.length} cars`);

    const workBook = new excelJs.Workbook();
    const browser = await puppeteer.launch();

    let done = 0;
    for (const car of cars) {
        const carTableHtml = await extractCarHtml(browser, car);

        const table = processCarTable(carTableHtml);

        if (!table) {
            console.log(`cant fetch table for car ${car.name}`);
            continue;
        }

        const sheet = workBook.addWorksheet(car.name);

        const cols = [];
        table.forEach((col, idx) => {
            cols.push({
                header: col[1],
                key: idx + 1, 
            });
        });

        sheet.columns = cols;

        table.forEach((col, idx) => {
            const values = col.slice(1).map((v) => v.replace('&nbsp;', ''));

            sheet.getColumn(idx + 1).values = values;
        });

        done += 1;

        console.log(`processed ${done} of ${cars.length}`);
    }

    await browser.close();

    await workBook.xlsx.writeFile('./cars.xlsx');
}

main().then(() => {
    console.log('Done. Bye.');
}).catch((err) => {
    console.error('Something went wrong.', err);
    process.exit(1);
});
