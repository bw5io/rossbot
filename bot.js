
const { Client, MessageEmbed, VoiceConnection } = require('discord.js');
const axios = require('axios');
const client = new Client();
const mysql = require('mysql');
const prefix = '!ross';
const problemUrlBase = 'https://leetcode.com/problems/';
const ltApiUrl = 'https://leetcode.com/api/problems/all/';
const allProblems = [];
const freeProblems = [];
const paidProblems = [];
const completedProblems = [];
let totalProblems;

// Connect to database

var pool = mysql.createPool({
	host: process.env.MYSQL_SRV_ADDRESS,
	user: process.env.MYSQL_SRV_USR,
	password: process.env.MYSQL_SRV_PW,
	database: 'dcbot'
  });
  
pool.getConnection(function(err, conn) {
	if (err) throw err;
	console.log("Connected!");
	conn.release();
});

/**
 * Returns a random number based on provided max constraint.
 * @param {int} max
 */
function getRandomInt(max) {
	let randomizedNumber = Math.floor(Math.random() * Math.floor(max));
	return randomizedNumber;
}

function checkExist(challengeID){
	if (completedProblems.includes(challengeID)) return true;
	completedProblems.push(challengeID);
	return false;
}

/**
 * Problem class to help parse the revelant properties of a problem from the Leetcode API
 * @param {*} problemObject
 */
function Problem(problemObject) {
	this.id = problemObject.stat.question_id;
	this.title = problemObject.stat.question__title;
	this.titleSlug = problemObject.stat.question__title_slug;
	this.difficulty =
    problemObject.difficulty.level === 3 ? 'Hard' : problemObject.difficulty.level === 2 ? 'Medium' : 'Easy';
	this.paidOnly = problemObject.paid_only;
	this.description = `Problem ID: ${this.id}\nTitle: ${this.title}\nSlug Title: ${this.titleSlug}\nDifficulty: ${this.difficulty}\nIs Paid? ${this.paidOnly}`;
}

/**
 * REST call to populate our arrays with data.
 */
axios
	.get(ltApiUrl)
	.then((resp) => {
		totalProblems = resp.data.num_total;
		resp.data.stat_status_pairs.forEach((problem) => {
			const newProblem = new Problem(problem);
			// ToDo need to fix .filter but this works in the mean time
			if (newProblem.paidOnly === false) {
				freeProblems.push(newProblem);
			}
			else {
				paidProblems.push(newProblem);
			}
			allProblems.push(newProblem);
		});
	})
	.catch((err) => {
		console.log(err);
	});

// Bot code

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

/**
 * Takes in the relevant array for the operation based on command and the message received by the bot.
 * Builds the MessageEmbed object with relevant info to be sent out to the particular channel/user.
 * @param {*} data
 * @param {*} msg
 * @param {string} diff
 */
function problemType(data, msg, diff = '') {
	if (diff != '') {
		const filteredByDiff = data.filter(
			(problem) => problem.difficulty.toLowerCase() === diff,
		);
		data = filteredByDiff;
	}
	const dataLen = data.length;
	pool.getConnection(function(err,conn){
		if (err) throw err;
		conn.query("SELECT challenge_id FROM attempted_challenges WHERE server_id = ?", msg.guild.id, function(err, result){
			if (err) throw err;
			let server = msg.guild.id;
			resArray = result.map(v=>v.challenge_id);
			let aProblem;
			do{
				const randProblem = getRandomInt(dataLen);
				// get server id
				aProblem = data[randProblem];
			}
			while(resArray.includes(aProblem.id));
			console.log(server);
			console.log(aProblem.id);
			createRecord(server,aProblem.id);
			const problemUrl = problemUrlBase + aProblem.titleSlug + '/';
			const embed = new MessageEmbed()
				.setTitle(aProblem.title)
				.setColor('#f89f1b')
				// online image from leetcode website for thumbnail (pls don't go down)
				.setThumbnail('https://leetcode.com/static/images/LeetCode_logo_rvs.png')
				// ToDo Scrape problem descriptions, add to object and embed (haHA might not do this)
				.setDescription(`${aProblem.difficulty} ${
					aProblem.paidOnly ? 'locked/paid' : 'unlocked/free'
				} problem.`)
				.setURL(problemUrl);
			msg.channel.send(embed);
			conn.release();
		});
	});

}

function createRecord(ServerID, ChallengeID){
	pool.getConnection(function(err, conn) {
		if (err) throw err;
		console.log("Connected!");
		var sql = "INSERT INTO attempted_challenges (server_id, challenge_id) VALUES ?";
		var values = [
		  [ServerID, ChallengeID],
		];
		conn.query(sql, [values], function (err, result) {
		  if (err) throw err;
		  console.log("Number of records inserted: " + result.affectedRows);
		});
		conn.release();
	});
}


client.on('message', (msg) => {
	if (!msg.content.startsWith(prefix) || msg.author.bot) return;
	const args = msg.content.slice(prefix.length).trim().split(' ');
	const command = args.shift().toLowerCase();
	let diff;

	if (typeof args[0] != 'undefined') {
		const temp = args[0].toLowerCase();
		if (['easy', 'medium', 'hard'].indexOf(temp) >= 0) {
			diff = temp;
		}
	}

	if (command === 'info') {
		msg.channel.send(
			`Leetcode currently has a total of ${totalProblems} problems of which ${freeProblems.length} are free, and ${paidProblems.length} are paid.`,
		);
	}
	else if (command === 'free') {
		problemType(freeProblems, msg, diff);
	}
	else if (command === 'paid') {
		problemType(paidProblems, msg, diff);
	}
	else if (command === 'help') {
		msg.channel.send(
			'```Usage:\n\n\t!problem (without args) - gives you a random problem of any difficulty either paid/free.' +
			'\n\n\t!problem free - gives you a random freely accessible problem of any difficulty.' +
			'\n\n\t!problem paid - gives you a random paid/locked problem of any difficulty.' +
			'\n\nAdding difficulty modifiers:\n\n\t!problem <free | paid> <easy | medium | hard> - lets you pick a random free or paid problem of the chosen difficulty.```',
		);
	}
	else if (command === 'completed'){
		pool.getConnection(function(err,conn){
			if (err) throw err;
			conn.query("SELECT challenge_id FROM attempted_challenges WHERE server_id = ?", msg.guild.id, function(err, result){
				if (err) throw err;
				resArray = result.map(v=>v.challenge_id);
				msg.channel.send("Completed Challenges");
				msg.channel.send(resArray);
				conn.release();
			});
		});

	}
	else {
		problemType(allProblems, msg, diff);
	}
});

client.login(process.env.DISCORD_BOT_TOKEN);
