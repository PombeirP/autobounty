/*
* Bot that receives a POST request (from a GitHub issue comment webhook)
* and in case it's a comment that has "@autobounty <decimal> <currency>"
* awards that bounty to the address posted earlier in the thread (by the
* commiteth bot).
* TODO tests
* REVIEW parsing, non-persisting storage of addresses, hardcoded string length.
* Depends on commiteth version as of 2017-06-10.
*/

const config = require('./config');
const bot = require('./bot');

var express = require('express'),
    cors = require('cors'),
    helmet = require('helmet'),
    app = express(),
    bodyParser = require('body-parser'),
    jsonParser = bodyParser.json();

app.use(cors());
app.use(helmet());

// Receive a POST request at the url specified by an env. var.
app.post(`${config.urlEndpoint}`, jsonParser, function (req, res, next) {
    if (!req.body || !req.body.action) {
        return res.sendStatus(400);
    } else if (!bot.needsFunding(req)) {
        return res.sendStatus(204);
    }
    console.log('new req to process:' + req.body);
    setTimeout(() => {
        processRequest(req)
            .then(() => {
                console.log('Well funded');
	    })
            .catch((err) => {
                bot.error('Error funding issue: ' + req.body.issue.url);
                bot.error('error: ' + err);
                bot.error('dump: ' + req);
            });
    }, config.delayInMiliSeconds);

    return res.sendStatus(200);
});

const processRequest = function (req) {
    const eth = bot.eth;
    const from = config.sourceAddress;
    const to = bot.getAddress(req);

    // Asynchronous requests for Gas Price and Amount
    const amountPromise = bot.getAmount(req);
    const gasPricePromise = bot.getGasPrice();
    console.log('processingRequest...');
    return new Promise((resolve, reject) => {
	Promise.all([amountPromise, gasPricePromise])
            .then(function (results) {
                let amount = results[0];
                let gasPrice = results[1];
                let transaction = sendTransaction(eth, from, to, amount, gasPrice);

                transaction
                    .then(function () {
                        resolve();
                    })
                    .catch(function (err) {
                        reject(err);
                    });

            })
            .catch(function (err) {
                reject(err);
            });
        });
}

const sendTransaction = function (eth, from, to, amount, gasPrice) {
    console.log('sending transaction...');
    return new Promise((resolve, reject) => {
        if (!config.realTransaction) {
            let txID = -1;
            bot.logTransaction(txID, from, to, amount, gasPrice);
            resolve();
        } else {
            eth.getTransactionCount(from, (err, nonce) => {
                eth.sendTransaction({
                    from: from,
                    to: to,
                    gas: gas,
                    gasPrice: gasPrice,
                    value: amount,
                    nonce,
                }, (err, txID) => {
                    if (!err) {
                        bot.logTransaction(txID, from, to, amount, gasPrice);
                        resolve();
                    } else {
                        reject(err);
                    }
                });
            });
        }
    });
}

const port = process.env.PORT || 8181
app.listen(port, function () {
    bot.log('Autobounty listening on port', port);
});
