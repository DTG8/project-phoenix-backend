// =================================================================
// ||                     CLOUD PHOENIX                           ||
// ||         BACKEND SERVER - V2 DEFINITIVE UPDATE               ||
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

const AssetSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ipAddress: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['Active', 'Inactive', 'Decommissioned'], default: 'Active' },
    cloudModel: { type: String, required: true },
    provider: { type: String },
    location: { type: String },
    assetDepartment: { type: String, required: true, enum: ['Cloud', 'Network', 'VOIP'] },
    username: { type: String },
    password: { type: String },
    notes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastUpdated: { type: Date, default: Date.now },
});

const ProjectSchema = new mongoose.Schema({ name: { type: String, required: true }}); // Simplified for brevity
const TaskSchema = new mongoose.Schema({ title: { type: String, required: true }}); // Simplified for brevity
const HandoffSchema = new mongoose.Schema({ summary: { type: String, required: true }}); // Simplified for brevity

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

assetRouter.post('/', async (req, res) => {
    const { name, ipAddress, type, status, cloudModel, provider, location, assetDepartment, username, password, notes } = req.body;
    try {
        const newAsset = new Asset({ name, ipAddress, type, status, cloudModel, provider, location, assetDepartment, username, password, notes, createdBy: req.user.id, lastUpdated: new Date() });
        const asset = await newAsset.save();
        res.json(asset);
    } catch (err) { console.error(err.message); res.status(500).send('Server error'); }
});

assetRouter.get('/', async (req, res) => { try { const assets = await Asset.find().sort({ lastUpdated: -1 }); res.json(assets); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });

assetRouter.put('/:id', async (req, res) => {
    const { name, ipAddress, type, status, cloudModel, provider, location, assetDepartment, username, password, notes } = req.body;
    const assetFields = { name, ipAddress, type, status, cloudModel, provider, location, assetDepartment, username, notes, lastUpdated: new Date() };
    if (password) assetFields.password = password; // Only update password if provided
    try {
        let asset = await Asset.findById(req.params.id);
        if (!asset) return res.status(404).json({ msg: 'Asset not found' });
        asset = await Asset.findByIdAndUpdate(req.params.id, { $set: assetFields }, { new: true });
        res.json(asset);
    } catch (err) { console.error(err.message); res.status(500).send('Server error'); }
});

assetRouter.delete('/:id', async (req, res) => { try { let asset = await Asset.findById(req.params.id); if (!asset) return res.status(404).json({ msg: 'Asset not found' }); await Asset.findByIdAndRemove(req.params.id); res.json({ msg: 'Asset removed' }); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
app.use('/api/assets', assetRouter);

// Other Routes (Unchanged)
// ...

// Server Startup
app.get('/', (req, res) => res.send('Cloud Phoenix API is running...'));
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
