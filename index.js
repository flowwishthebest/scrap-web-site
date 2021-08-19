'use strict';

const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const tableParser = require('cheerio-tableparser');
const excelJs = require('exceljs');

const url = 'https://immokoks.com';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    console.log(`fetching page ${link}`);
    const page = await browser.newPage();
    await page.goto(link);
    page.evaluate((_) => window.scrollBy(0, 1000));
    await sleep(2000);
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

function isAnchor(str){
    return /^\<a.*\>.*\<\/a\>/i.test(str);
}

async function processCar(car, browser, workBook) {
    const carTableHtml = await extractCarHtml(browser, car);

    const table = processCarTable(carTableHtml);

    if (!table) {
        return console.log(`cant fetch table for car ${car.name}`);
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

    for (const [idx, col] of table.entries()) {
        const values = col.slice(1).map((v) => v.replace('&nbsp;', ''));

        const processedValues = [];
        for (const v of values) {
            if (isAnchor(v)) {
                const $ = cheerio.load(v);
                const [a] = $('a').toArray().map((el) => {
                    return {
                        href: el.attribs['href'],
                        txt: $(el).text(),
                    };
                });

                processedValues.push(a.txt);

                if (a.txt === 'MANUAL') {
                    const cached = manuals[a.href];
                    if (!cached) {
                        console.log(
                            `fetching manual (${a.href}) for car ${car.name}`,
                        );

                        const html = await getFullyLoadedHtml(browser, a.href);
                        const $ = cheerio.load(html, null, false);

                        const txt = $('div[id^="comp-"]').contents().text();

                        sheet.getCell(1, idx + 1).note = txt;

                        manuals[a.href] = 1;
                    }
                }
            } else {
                processedValues.push(v);
            }
        }

        sheet.getColumn(idx + 1).values = processedValues;
    }
}

const manuals = {};

async function main() {
    const browser = await puppeteer.launch();

    const html = await getFullyLoadedHtml(browser, url);
    console.log('fetched html page');

    const cars = extractCars(html);
    console.log(`extracted ${cars.length} cars`);

    const workBook = new excelJs.Workbook();
    
    let done = 0;
    for (const car of cars) {
        await processCar(car, browser, workBook);
        done += 1;
        console.log(`processed ${done} of ${cars.length}`);
    }

    await browser.close();

    await workBook.xlsx.writeFile('./cars2.xlsx');
}

main().then(() => {
    console.log('Done. Bye.');
}).catch((err) => {
    console.error('Something went wrong.', err);
    process.exit(1);
});
