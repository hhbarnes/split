#!/usr/bin/env node

const fs = require('fs');
const util = require('util');
const async = require('async');
const commandLineArgs = require('command-line-args');
const splitByLine = require('split-file-by-line');
const concat = require('concat');
const TextFileDiff = require('text-file-diff');
const glob = require('glob');

const compare = new TextFileDiff();

const optionDefinitions = [
	{
		name: 'verbose',
		alias: 'v',
		type: Boolean,
		description: 'Display details as the the command runs.',
	},
	{
		name: 'src',
		type: String,
		multiple: true,
		defaultOption: true,
		description: 'The input files to process',
	},
	{
		name: 'lines',
		alias: 'l',
		type: Number,
		default: 6000,
		description: 'Maxium number of lines in output files, default is 6000.',
	},
	{
		name: 'help',
		alias: 'h',
		description: 'Display this usage guide.',
	},
];

const options = commandLineArgs(optionDefinitions);

const valid = options.help || (
	/* all supplied files should exist and --log-level should be one from the list */
	options.src
    && options.src.length
	&& options.src.every(fs.existsSync)
);

if (valid) {
	// Process each input file one at a time
	async.each(options.src, (inputFile, next) => {
		// Split files
		const inputFileComp = inputFile.split('.', 2);
		const outputfile = `${inputFileComp[0]}-split-`;

		// Check directory to see if files exist
		glob(`${inputFileComp[0]}-*`, (err, files) => {
			if (files.length > 0) {
				console.log(`Unable to process ${inputFile}. Please remove old files: ${files.join(', ')}`);
				return;
			}

			console.log(`Starting to split ${inputFile} into files with a maximum of ${options.lines} lines each.`);
			splitByLine.split(inputFile, outputfile, options.lines, (fileArray) => {
				// bug workaround last file added twice to array
				if (fileArray.length > 1) fileArray.pop();
				console.log(`${inputFile} split into ${fileArray.length} files`);

				// Combining output files into single file for validation
				const checkFileName = `${inputFileComp[0]}-verification`;
				concat(fileArray).then((results) => {
					console.log(`Creating ${checkFileName} verification file`);

					// remove blank lines from validation file
					let cleanResults = results;
					if (cleanResults.search(/(\r\n\r\n)/gm) > -1) cleanResults = cleanResults.replace(/(\r\n\r\n)/gm, '\r\n');
					if (cleanResults.search(/(\n\n)/gm) > -1) cleanResults = cleanResults.replace(/(\n\n)/gm, '\n');
					if (cleanResults.search(/(\r\r)/gm) > -1) cleanResults = cleanResults.replace(/(\r\r)/gm, '\r');

					const fd = fs.openSync(checkFileName, 'w');
					const buf = Buffer.from(cleanResults);
					fs.writeSync(fd, buf);
					fs.closeSync(fd);
					console.log('Verification file created');

					// Setup validation and compare, saving log
					let errorCount = 0;
					let msg = '';

					const checkFileLogName = `${inputFileComp[0]}-verification-log`;
					console.log(`Creating ${checkFileLogName} file`);
					const checkFileLog = fs.createWriteStream(checkFileLogName, { flags: 'w' });

					// Setup Compare Tool
					compare.on('compared', (line1, line2, compareResult) => {												
						if ((compareResult !== 0) && (!line1) && (!line2)) {
							errorCount += 1;
							msg = util.format(`***MISMATCH***: ${line1} || ${line2},\n`);
						} else {
							msg = util.format(`MATCH: ${line1} || ${line2},\n`);
						}

						// Write Message
						checkFileLog.write(msg);
						if (options.verbose) console.log(msg);
					});

					compare.on('-', (line) => {
						errorCount += 1;
						msg = util.format(`***MISSING***: File ${checkFileName}, text ${line}\n`);

						// Write Message
						checkFileLog.write(msg);
						if (options.verbose) console.log(msg);
					});

					compare.on('+', (line) => {
						errorCount += 1;
						msg = util.format(`***MISSING***: File ${inputFile}, text ${line}\n`);

						// Write Message
						checkFileLog.write(msg);
						if (options.verbose) console.log(msg);
					});

					// run the diff
					compare.diff(inputFile, checkFileName);

					if (errorCount > 0) {
						console.log(`Validation complete, errors found, refer to ${checkFileLogName} for details.`);
					} else {
						console.log(`Validation complete, no errors found, refer to ${checkFileLogName} for details.  Output files are: ${fileArray.join(', ')}`);
					}
				});
			});

			next();
		});
	}, (err) => {
		if (err) {
			console.log('A file failed to process');
			console.log(err);
		}
	});
} else {
	console.log('Input file(s) not specified.');
}
