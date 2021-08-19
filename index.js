'use strict';

const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const tableParser = require('cheerio-tableparser');
const excelJs = require('exceljs');

const url = 'https://immokoks.com';

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
    await new Promise((resolve) => setTimeout(resolve, 2500));
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

function isAnchor(str){
    return /^\<a.*\>.*\<\/a\>/i.test(str);
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
                        console.log('Need to parse manual', a);
                        const cached = manuals[a.href];
                        if (!cached) {
                            console.log('fetching manual from', a);
                            const html = await getFullyLoadedHtml(browser, a.href);
                            const $ = cheerio.load(html, null, false);

                            const txt = $('div[id^="comp-"]').contents().text();

                            console.log(txt);

                            require('fs').writeFileSync(require('path').join('.', car.name), txt);

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
