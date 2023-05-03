require('dotenv').config();
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const cloudnary = require('./utils/cloudinary');
const aqp = require('api-query-params');

const app = express();
const { PORT, CECRET_KEY, DOMAIN_CLIENT } = process.env;
const account = require('./models/account');
const post = require('./models/post');
const option = { origin: DOMAIN_CLIENT, credentials: true };

app.use(cors(option));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(fileUpload());

app.get('/', (req, res) => {
    res.send('Home page');
});

app.post('/verify-token', (req, res) => {
    const accessToken = req.cookies.accessToken;
    if (accessToken) {
        jwt.verify(
            accessToken,
            CECRET_KEY,
            { algorithm: 'HS256' },
            (err, data) => {
                if (err) return res.status(401).send('authorization failed');
                return res.status(200).json({
                    status: 'success',
                    data,
                    error: null
                });
            }
        );
    } else {
        return res.status(401).send('authorization failed');
    }
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(401).send('username or password is empty');
    const check = await account.findOne({ username }).lean();

    if (!check) {
        try {
            const hashedPassword = bcrypt.hashSync(password, 10);
            const result = await account.create({
                username,
                password: hashedPassword
            });
            const role = 'user';

            jwt.sign(
                { id: result._id, username: result.username, role },
                CECRET_KEY,
                { algorithm: 'HS256' },
                (err, data) => {
                    if (err)
                        return res.status(401).send('Token generation failed');

                    const accessToken = data;
                    res.cookie('accessToken', accessToken, {
                        maxAge: 60 * 60 * 1000,
                        secure: true,
                        httpOnly: true,
                        sameSite: 'none'
                    }).json({
                        username: result.username,
                        userId: result._id
                    });
                    res.status(200).json({
                        error: null,
                        status: 'Register success',
                        token: {
                            accessToken
                        }
                    });
                }
            );
        } catch (error) {
            return res.status(500).json({
                error,
                data: null
            });
        }
    } else {
        return res.status(401).send('account exists');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(401).send('username or password is empty');
    try {
        const acountCurrent = await account.findOne({ username }).lean();
        const role = acountCurrent.role ?? 'user';
        const check = !!acountCurrent
            ? bcrypt.compareSync(password, acountCurrent.password)
            : false;

        if (check) {
            jwt.sign(
                { id: acountCurrent._id, username, role },
                CECRET_KEY,
                {
                    algorithm: 'HS256'
                },
                (err, data) => {
                    if (err)
                        return res.status(401).send('Token generation failed');

                    const accessToken = data;
                    res.cookie('accessToken', accessToken, {
                        maxAge: 1000 * 60 * 60,
                        secure: true,
                        httpOnly: true,
                        sameSite: 'none'
                    }).json({
                        username: acountCurrent.username,
                        userId: acountCurrent._id,
                        role,
                        token: {
                            accessToken,
                            refreshToken: null
                        }
                    });
                }
            );
        } else {
            return res.status(401).send('Login failed');
        }
    } catch (error) {
        return res.status(500).send(JSON.stringify(error));
    }
});

app.post('/logout', (req, res) => {
    res.clearCookie('accessToken');
    res.status(200).send('remove token susscess');
});

app.post('/post', async (req, res) => {
    try {
        const accessToken = req.cookies.accessToken;
        const { title, summary, content, file } = req.body;
        const resultUpload = await cloudnary.uploader.upload(file, {
            folder: "images"
        })

        jwt.verify(
            accessToken,
            CECRET_KEY,
            { algorithm: 'HS256' },
            (err, data) => {
                if (err) return res.status(401).send('Token generation failed');

                post.create({
                    title,
                    summary,
                    content,
                    cover: resultUpload.secure_url,
                    author: data.id
                })
                    .then((result) => {
                        return res.status(200).send(result);
                    })
                    .catch((e) => {
                        return res.sendStatus(500);
                    });
            }
        );
    } catch (error) {
        console.log(error);
        return res.sendStatus(500);
    }
});

app.get('/post', async (req, res) => {
    let { filter, limit } = aqp(req.query);
    delete filter.page;

    if (filter.title !== null) {
        filter.title = { $regex: `${filter.title}`, $options: 'i' };
    } else {
        filter = {};
    }

    const page = req.query.page;
    const skip = (page - 1) * limit;

    try {
        let result = await post
            .find(filter)
            .populate('author', ['username'])
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        return res.status(200).send(result);
    } catch (error) {
        console.log(error);
        return res.sendStatus(500);
    }
});

app.get('/numPost', async (req, res) => {
    try {
        const { filter } = aqp(req.query);
        delete filter.page;

        if (filter.title !== null) {
            filter.title = { $regex: `${filter.title}`, $options: 'i' };
        } else {
            filter = {};
        }

        let result = await post.countDocuments(filter);
        return res.status(200).send({ result });
    } catch (error) {
        return res.sendStatus(500);
    }
});

app.get('/post/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await post.findById(id).populate('author', ['username']);
        res.status(200).json(result);
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});

app.put('/post/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const accessToken = req.cookies.accessToken;
        const { title, summary, content, cover, file } = req.body;
        let newPath = '';

        if (file) {
            const resultUpload = await cloudnary.uploader.upload(file, {
                folder: "images"
            })
            newPath = resultUpload.secure_url;
        } else {
            newPath = cover;
        }

        jwt.verify(
            accessToken,
            CECRET_KEY,
            { algorithm: 'HS256' },
            (err, data) => {
                if (err) return res.status(401).send('Token generation failed');

                post.findByIdAndUpdate(id, {
                    title,
                    summary,
                    content,
                    cover: newPath,
                    author: data.id
                })
                    .then((result) => {
                        return res.status(200).send(result);
                    })
                    .catch((e) => {
                        console.log(e);
                        return res.sendStatus(500);
                    });
            }
        );
    } catch (error) {
        console.log(error);
        return res.sendStatus(500);
    }
});

app.delete('/delete/:id', async (req, res) => {
    try {
        const id = req.params.id;
        let result = await post.findByIdAndDelete(id);

        if (result) {
            return res.status(200).send(result);
        } else {
            return res.status(403).send('not permisson');
        }
    } catch (error) {
        console.log(error);
        return res.sendStatus(500);
    }
});

app.listen(PORT, () => {
    console.log(`app is listening on port::: ${PORT}`);
});
