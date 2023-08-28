import express from 'express';
import { Level } from 'level';
import bodyParser from 'body-parser';
import cors from 'cors';
import { ethers } from "ethers";
import 'dotenv/config';

const app = express();
const port = process.env.port || '9091';
const waitTime = Number(process.env.WAIT_TIME || 86400000);

const db = new Level(process.env.DB_PATH, { valueEncoding: 'json' });
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const faucetWallet = new ethers.Wallet(process.env.FAUCET_PRIVATE_KEY, provider);

async function checkAddress(walletAddress) {
    const value = await db.get(walletAddress).catch(() => null);
    if (value) {
        const t = Number(value) + waitTime - new Date().getTime();
        return Math.max(t, 0);
    } else {
        return 0;
    }
}

async function sendEth(toAddress, amountInEther) {
    const value = ethers.parseEther(amountInEther.toString());
    const tx = {
        to: toAddress,
        value: value
    };
    const txResponse = await faucetWallet.sendTransaction(tx);
    const txReceipt = await txResponse.wait();
    return txReceipt;
}

app.use(cors());
app.use(bodyParser.json());

app.get('/ping', (_, res) => {
    res.send('pong');
});

app.get('/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress;
        if (!ethers.isAddress(walletAddress)) {
            throw new Error('INVALID_ADDRESS');
        }
        res.json(await checkAddress(walletAddress));
    } catch(err) {
        res.status(500).json({ message: err?.code || err?.message || 'UNKNOWN_ERROR' });
    }
});

app.post('/', async (req, res) => {
    try {
        const walletAddress = req.body.walletAddress;
        if (!ethers.isAddress(walletAddress)) {
            throw new Error('INVALID_ADDRESS');
        }
        if (await checkAddress(walletAddress) > 0) {
            throw new Error('WAIT_TIME')
        }
        const working = await db.get('working_' + walletAddress).catch(() => null);
        if (working) {
            throw new Error('WORKING');
        }
        await db.put('working_' + walletAddress, '1');
        const receipt = await sendEth(walletAddress, process.env.AMOUNT || '0.001');
        await db.put(walletAddress, new Date().getTime().toString());
        await db.del('working_' + walletAddress);
        res.json(true);
    } catch(err) {
        res.status(500).json({ message: err?.code || err?.message || 'UNKNOWN_ERROR' });
    }
});

app.listen(port, () => {
    console.log(`faucet app listening on port ${port}`);
});
