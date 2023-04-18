require('dotenv').config();
const mongoose = require('mongoose');
const { MONGODB_PASSWORD } = process.env;
mongoose
    .connect(
        `mongodb+srv://blog:${MONGODB_PASSWORD}@cluster0.m3kuk7k.mongodb.net/authdb`
    )
    .then(() => {
        console.log('mongodb connected');
    })
    .catch((e) => {
        console.log(`mongodb error::: ${JSON.stringify(e)}`);
    });

const accountSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        unique: true
    }
});

const account = mongoose.model('account', accountSchema);

module.exports = account;
