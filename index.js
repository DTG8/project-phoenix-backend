// =================================================================
// ||                     PROJECT PHOENIX                         ||
// ||                BACKEND SERVER - FINAL VERSION               ||
// =================================================================
// || This version includes the critical CORS fix to allow the    ||
// || frontend and backend to communicate with each other.        ||
// =================================================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt =require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// ===========================================
// ||           MIDDLEWARE CONFIG           ||
// ===========================================
// *** THE FIX IS HERE ***
// We are explicitly telling the server to allow requests from our frontend's origin.
app.use(cors({
    origin: 'http://localhost:3000'
}));

app.use(express.json());

// ===========================================
// ||           DATABASE CONNECTION         ||
// ===========================================
// Re-enabling the database connection for the final test.
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('Successfully connected to MongoDB Atlas.'))
.catch(err => {
    console.error('Database connection error:', err);
    process.exit(1); // Exit process with failure
});


// ===========================================
// ||           DATABASE MODELS (SCHEMAS)   ||
// ===========================================
// (This section remains unchanged)
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    createdAt: { type: Date, default: Date.now },
});
const AssetSchema = new mongoose.Schema({ name: { type: String, required: true }, ipAddress: { type: String, required: true }, type: { type: String, required: true }, status: { type: String, enum: ['Active', 'Down', 'Maintenance', 'Decommissioned'], default: 'Active' }, tags: [{ type: String }], notes: { type: String }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, lastUpdated: { type: Date, default: Date.now }, });
const ProjectSchema = new mongoose.Schema({ name: { type: String, required: true }, description: { type: String }, status: { type: String, enum: ['Not Started', 'In Progress', 'Completed', 'On Hold'], default: 'Not Started' }, owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], createdAt: { type: Date, default: Date.now }, });
const TaskSchema = new mongoose.Schema({ project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true }, title: { type: String, required: true }, description: { type: String }, assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, dueDate: { type: Date }, status: { type: String, enum: ['To Do', 'In Progress', 'In Review', 'Done'], default: 'To Do' }, subTasks: [{ title: String, completed: { type: Boolean, default: false } }], createdAt: { type: Date, default: Date.now }, });
const HandoffSchema = new mongoose.Schema({ fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, summary: { type: String, required: true }, relatedAssets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }], relatedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }], createdAt: { type: Date, default: Date.now }, });
const User = mongoose.model('User', UserSchema);
const Asset = mongoose.model('Asset', AssetSchema);
const Project = mongoose.model('Project', ProjectSchema);
const Task = mongoose.model('Task', TaskSchema);
const Handoff = mongoose.model('Handoff', HandoffSchema);


// ===========================================
// ||       AUTHENTICATION MIDDLEWARE       ||
// ===========================================
// (This section remains unchanged)
const authMiddleware = (req, res, next) => { const token = req.header('x-auth-token'); if (!token) { return res.status(401).json({ msg: 'No token, authorization denied' }); } try { const decoded = jwt.verify(token, process.env.JWT_SECRET); req.user = decoded.user; next(); } catch (err) { res.status(401).json({ msg: 'Token is not valid' }); } };


// ===========================================
// ||               API ROUTES              ||
// ===========================================
// (This section remains unchanged)
const authRouter = express.Router();
authRouter.post('/register', async (req, res) => { const { name, email, password } = req.body; try { let user = await User.findOne({ email }); if (user) { return res.status(400).json({ msg: 'User already exists' }); } user = new User({ name, email, password }); const salt = await bcrypt.genSalt(10); user.password = await bcrypt.hash(password, salt); await user.save(); const payload = { user: { id: user.id } }; jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => { if (err) throw err; res.json({ token }); }); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
authRouter.post('/login', async (req, res) => { const { email, password } = req.body; try { let user = await User.findOne({ email }); if (!user) { return res.status(400).json({ msg: 'Invalid credentials' }); } const isMatch = await bcrypt.compare(password, user.password); if (!isMatch) { return res.status(400).json({ msg: 'Invalid credentials' }); } const payload = { user: { id: user.id } }; jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => { if (err) throw err; res.json({ token }); }); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
authRouter.get('/', authMiddleware, async (req, res) => { try { const user = await User.findById(req.user.id).select('-password'); res.json(user); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
app.use('/api/auth', authRouter);

const assetRouter = express.Router();
assetRouter.use(authMiddleware);
assetRouter.post('/', async (req, res) => { const { name, ipAddress, type, status, tags, notes } = req.body; try { const newAsset = new Asset({ name, ipAddress, type, status, tags, notes, createdBy: req.user.id, }); const asset = await newAsset.save(); res.json(asset); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
assetRouter.get('/', async (req, res) => { try { const assets = await Asset.find().populate('createdBy', 'name email').sort({ lastUpdated: -1 }); res.json(assets); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
assetRouter.put('/:id', async (req, res) => { const { name, ipAddress, type, status, tags, notes } = req.body; const assetFields = { name, ipAddress, type, status, tags, notes, lastUpdated: Date.now() }; try { let asset = await Asset.findById(req.params.id); if (!asset) return res.status(404).json({ msg: 'Asset not found' }); asset = await Asset.findByIdAndUpdate(req.params.id, { $set: assetFields }, { new: true }); res.json(asset); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
assetRouter.delete('/:id', async (req, res) => { try { let asset = await Asset.findById(req.params.id); if (!asset) return res.status(404).json({ msg: 'Asset not found' }); await Asset.findByIdAndRemove(req.params.id); res.json({ msg: 'Asset removed' }); } catch (err) { console.error(err.message); res.status(500).send('Server error'); } });
app.use('/api/assets', assetRouter);

const projectRouter = express.Router();
projectRouter.use(authMiddleware); app.use('/api/projects', projectRouter);
const taskRouter = express.Router();
taskRouter.use(authMiddleware); app.use('/api/tasks', taskRouter);
const handoffRouter = express.Router();
handoffRouter.use(authMiddleware); app.use('/api/handoffs', handoffRouter);


// ===========================================
// ||            SERVER STARTUP             ||
// ===========================================
app.get('/', (req, res) => res.send('Project Phoenix API is running...'));
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));



