#!/usr/bin/env node

const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const glob = require('glob');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const splitByLine = require('split-file-by-line');
const async = require('async');

// ************************************************************
// ************** Process Command Line Arguments **************
// ************************************************************
const optionDefinitions = [
	{
		name: 'help',
		alias: 'h',
		type: Boolean,
		description: 'Display this usage guide',
	},
	{
		name: 'verbose',
		alias: 'v',
		type: Boolean,
		description: 'Display detailed messages as the utility runs',
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
		description: 'Maxium number of lines in output files, default is 6000',
	},
];

const helpSections = [
	{
		header: 'Split',
		content: 'Command Utility to split a text file into smaller files based on line count, then audits the split files.',
	},
	{
		header: 'Options',
		optionList: optionDefinitions,
	},
];

// Retrieve Args
const options = commandLineArgs(optionDefinitions);

// Set Defaults for missing Args
if (!Object.prototype.hasOwnProperty.call(options, 'lines')) options.lines = 6000;
if (!Object.prototype.hasOwnProperty.call(options, 'verbose')) options.verbose = false;
if (!Object.prototype.hasOwnProperty.call(options, 'help')) options.help = false;

// Display Help if selected and exit
if (options.help) {
	console.log(commandLineUsage(helpSections));
	process.exit(0);
}

// Validate src was passed if not display error and exit
if (!(options.src && options.src.length)) {
	console.log('Source file(s) not specified or invaild.');
	process.exit(0);
}

// ************************************************************
// *************** Build list of files to split ***************
// ************************************************************
let files2Split = [];

// Retrieve list of files if directory and validate they exist.
options.src.forEach((src) => {
	// Retrieve Files from entry
	const globResults = glob.sync(src, { nonull: false, mark: true, nodir: false });

	// Process each element
	globResults.forEach((element) => {
		// Check to see if it is a directory, if so query the directory for files. If
		// not add the file to the list. Skip any previous run's output
		if (element.search('-split') === -1) {
			if (element[element.length - 1] === '/') {
				files2Split = files2Split.concat(glob.sync(`${element}*`, { nonull: false, mark: true, nodir: true }));
			} else {
				files2Split.push(element);
			}
		}
	});
});

console.log(`Spliting the following files: ${files2Split.join(', ')}`);


// ************************************************************
// *********************** Split Files ************************
// ************************************************************

// Store current directory
const cwd = path.resolve(process.cwd());

// Process Each file
files2Split.forEach((sourceFile) => {
	process.chdir(cwd);

	// ***** Create Directory for output files
	let workingDirectory = `${sourceFile}-split`;
	let i = 0;

	// Find a directory that doesn't exist
	while (fs.existsSync(workingDirectory)) {
		i += 1;
		workingDirectory = `${sourceFile}-split-${i}`;
	}
	// Create Working Directory
	fs.mkdirSync(workingDirectory);

	// ***** Copy File to working directory
	const workingFile = `${workingDirectory}/original`;
	fs.copyFileSync(sourceFile, workingFile);
	process.chdir(workingDirectory);

	// ***** Split the file
	console.log(`Starting to split ${sourceFile} into files with a maximum of ${options.lines} lines each.`);
	let splitFileArray = [];

	splitByLine.split('original', 'file-', options.lines, (fileArray) => {
		console.log(`${sourceFile} split into ${fileArray.length} files. Results are in the ${workingDirectory} directory`);
		splitFileArray = fileArray;
	});

	// ***** Create Audit File
	// Load original file
	const originalArray = [];
	const origInterface = readline.createInterface({
		input: fs.createReadStream('original'),
	});

	origInterface.on('line', (line) => {
		originalArray.push(line);
	});

	origInterface.on('close', () => {
		// Do Comparison with subfiles
		let orgRow = 0;

		async.each(splitFileArray, (splitFile, next) => {
			let splitRow = 0;

			console.log(splitFile);
			const splitInterface = readline.createInterface({
				input: fs.createReadStream(splitFile),
			});

			splitInterface.on('line', (line) => {
				// console.log(`${sourceFile} ${orgRow + 1}: ${originalArray[orgRow]} = ${splitFile} ${splitRow}: ${line}`);
				splitRow += 1;
				orgRow += 1;
			});

			splitInterface.on('close', () => {
				next();
			});
		});
	});
});
