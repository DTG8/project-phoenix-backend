// =================================================================
// ||                     PROJECT PHOENIX                         ||
// ||         BACKEND SERVER - ASSET ENHANCEMENT UPDATE           ||
// =================================================================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({ origin: 'https://cloudphoenix.netlify.app' }));
app.use(express.json());

// DB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true, })
.then(() => console.log('Successfully connected to MongoDB Atlas.'))
.catch(err => { console.error('Database connection error:', err); process.exit(1); });

// ===========================================
// ||        UPDATED DATABASE MODELS        ||
// ===========================================
const UserSchema = new mongoose.Schema({ name: { type: String, required: true }, email: { type: String, required: true, unique: true, lowercase: true }, password: { type: String, required: true }, role: { type: String, enum: ['user', 'admin'], default: 'user' }, createdAt: { type: Date, default: Date.now },});

// *** CHANGES START HERE ***
const AssetSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ipAddress: { type: String, required: true },
    type: { type: String, required: true },
    // Updated status enum
    status: { type: String, enum: ['Active', 'Inactive', 'Decommissioned'], default: 'Active' },
    // Added optional username and password fields
    username: { type: String },
    password: { type: String },
    tags: [{ type: String }],
    notes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastUpdated: { type: Date, default: Date.now },
});
// *** CHANGES END HERE ***

const ProjectSchema = new mongoose.Schema({ name: { type: String, required: true }, description: { type: String }, status: { type: String, enum: ['Not Started', 'In Progress', 'Completed', 'On Hold'], default: 'Not Started' }, owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], createdAt: { type: Date, default: Date.now }, });
const TaskSchema = new mongoose.Schema({ project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true }, title: { type: String, required: true }, description: { type: String }, assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, dueDate: { type: Date }, status: { type: String, enum: ['To Do', 'In Progress', 'In Review', 'Done'], default: 'To Do' }, subTasks: [{ title: String, completed: { type: Boolean, default: false } }], createdAt: { type: Date, default: Date.now }, });
const HandoffSchema = new mongoose.Schema({ fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, summary: { type: String, required: true }, relatedAssets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }], relatedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }], createdAt: { type: Date, default: Date.now }, });
const User = mongoose.model('User', UserSchema);
const Asset = mongoose.model('Asset', AssetSchema);
const Project = mongoose.model('Project', ProjectSchema);
const Task = mongoose.model('Task', TaskSchema);
const Handoff = mongoose.model('Handoff', HandoffSchema);

// Auth Middleware
const authMiddleware = (req, res, next) => { const token = req.header('x-auth-token'); if (!token) { return res.status(401).json({ msg: 'No token, authorization denied' }); } try { const decoded = jwt.verify(token, process.env.JWT_SECRET); req.user = decoded.user; next(); } catch (err) { res.status(401).json({ msg: 'Token is not valid' }); } };

// ===========================================
// ||         UPDATED API ROUTES            ||
// ===========================================
// --- Auth Routes (Unchanged) ---
const authRouter = express.Router();
authRouter.post('/register', async (req, res) => { const { name, email, password } = req.body; try { let user = await User.findOne({ email }); if (user) { return res.status(400).json({ msg: 'User already exists' }); } user = new User({ name, email, password }); const salt = await bcrypt.genSalt(10); user.password = await bcrypt.hash(password, salt); await user.save(); const payload = { user: { id: user.id } }; jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => { if (err) throw err; res.json({ token }); }); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
authRouter.post('/login', async (req, res) => { const { email, password } = req.body; try { let user = await User.findOne({ email }); if (!user) { return res.status(400).json({ msg: 'Invalid credentials' }); } const isMatch = await bcrypt.compare(password, user.password); if (!isMatch) { return res.status(400).json({ msg: 'Invalid credentials' }); } const payload = { user: { id: user.id } }; jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => { if (err) throw err; res.json({ token }); }); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
authRouter.get('/', authMiddleware, async (req, res) => { try { const user = await User.findById(req.user.id).select('-password'); res.json(user); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
app.use('/api/auth', authRouter);

// --- Asset Routes (Updated) ---
const assetRouter = express.Router();
assetRouter.use(authMiddleware);

// POST /api/assets (Updated to accept new fields)
assetRouter.post('/', async (req, res) => {
    // *** CHANGES START HERE ***
    const { name, ipAddress, type, status, username, password, tags, notes } = req.body;
    try {
        const newAsset = new Asset({
            name, ipAddress, type, status, username, password, tags, notes,
            createdBy: req.user.id,
        });
        const asset = await newAsset.save();
        res.json(asset);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
    // *** CHANGES END HERE ***
});

// GET /api/assets (Unchanged)
assetRouter.get('/', async (req, res) => { try { const assets = await Asset.find().populate('createdBy', 'name email').sort({ lastUpdated: -1 }); res.json(assets); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });

// PUT /api/assets/:id (Updated to handle all editable fields)
assetRouter.put('/:id', async (req, res) => {
    // *** CHANGES START HERE ***
    const { name, ipAddress, type, status, username, password, tags, notes } = req.body;
    const assetFields = {};
    if (name) assetFields.name = name;
    if (ipAddress) assetFields.ipAddress = ipAddress;
    if (type) assetFields.type = type;
    if (status) assetFields.status = status;
    if (username) assetFields.username = username;
    // Allow saving an empty password
    if (password !== undefined) assetFields.password = password;
    if (tags) assetFields.tags = tags;
    if (notes) assetFields.notes = notes;
    assetFields.lastUpdated = Date.now();

    try {
        let asset = await Asset.findById(req.params.id);
        if (!asset) return res.status(404).json({ msg: 'Asset not found' });

        asset = await Asset.findByIdAndUpdate(req.params.id, { $set: assetFields }, { new: true });
        res.json(asset);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
    // *** CHANGES END HERE ***
});

// DELETE /api/assets/:id (Unchanged)
assetRouter.delete('/:id', async (req, res) => { try { let asset = await Asset.findById(req.params.id); if (!asset) return res.status(404).json({ msg: 'Asset not found' }); await Asset.findByIdAndRemove(req.params.id); res.json({ msg: 'Asset removed' }); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
app.use('/api/assets', assetRouter);


// Other Routes (Unchanged)
const projectRouter = express.Router(); projectRouter.use(authMiddleware); app.use('/api/projects', projectRouter);
const taskRouter = express.Router(); taskRouter.use(authMiddleware); app.use('/api/tasks', taskRouter);
const handoffRouter = express.Router(); handoffRouter.use(authMiddleware); app.use('/api/handoffs', handoffRouter);

// Server Startup
app.get('/', (req, res) => res.send('Project Phoenix API is running...'));
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
