'use strict';

const got = require('got');
const cheerio = require('cheerio');

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

async function main() {
    const html = await loadHtml(url);
    console.log('fetched html page');
    const $ = cheerio.load(html, null, false);
    console.log('loaded html');
    const cars = extractCars($);
    console.log(`extracted ${cars.length} cars`);
}

main();
