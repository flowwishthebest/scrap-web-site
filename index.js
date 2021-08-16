'use strict';

const got = require('got');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

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

function extractCars($) {
    const entries = $('div[id^="comp-"] a');

    return entries.toArray()
        .filter((el) => el.attribs['aria-label'])
        .map((el) => ({
            name: el.attribs['aria-label'],
            link: el.attribs['href'],
        }));
}

async function extractCarHtml(browser, carUrl) {
    const page = await browser.newPage();
    await page.goto(carUrl);
    page.evaluate((_) => window.scrollBy(0, 1000));
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const html = await page.evaluate(
        () => document.querySelector('*').outerHTML,
    );
    await page.close();

    return html;
}

function extractCarTableSrc(html) {
    const $ = cheerio.load(html, null, false);

    const sources = $('div[id^="comp-"] iframe').toArray()
        .filter((el) => el.attribs['src'].startsWith('https://wix-visual'))
        .map((el) => el.attribs['src']);

    return sources[0];
}

async function main() {
    const html = await loadHtml(url);
    console.log('fetched html page');
    const $ = cheerio.load(html, null, false);
    console.log('loaded html');
    const cars = extractCars($);
    console.log(`extracted ${cars.length} cars`);

    console.log(cars[0]);

    const browser = await puppeteer.launch();

    for (const car of cars.slice(0, 1)) {
        const carHtml = await extractCarHtml(browser, car.link);
        const [src] = extractCarTableSrc(carHtml);
        if (!src) {
            console.log(`cant find table for ${car.name}`);
        }
    }

    await browser.close();
}

main();
