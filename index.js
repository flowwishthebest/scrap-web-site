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

async function main() {
    const html = await loadHtml(url);

	console.log('fetched html page');

	const $ = cheerio.load(html, null, false);

	console.log('loaded html');
}

main();
