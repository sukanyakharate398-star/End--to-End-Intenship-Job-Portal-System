const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// MongoDB Connection
const MONGODB_URI = 'mongodb://127.0.0.1:27017/jobportal';

console.log('📡 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('💡 MongoDB not running. Install from: https://www.mongodb.com/try/download/community\n');
    });

// ============ DATABASE SCHEMAS ============

// Users Table
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    skills: { type: String, default: '' },
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

// Jobs Table
const JobSchema = new mongoose.Schema({
    title: { type: String, required: true },
    company: { type: String, required: true },
    skills_required: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, default: 'Remote' },
    salary: { type: String, default: 'Negotiable' },
    type: { type: String, default: 'Full-time' },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Applications Table
const ApplicationSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    job_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    status: { type: String, default: 'pending' },
    appliedAt: { type: Date, default: Date.now }
});

// Prevent duplicate applications
ApplicationSchema.index({ user_id: 1, job_id: 1 }, { unique: true });

const User = mongoose.model('User', UserSchema);
const Job = mongoose.model('Job', JobSchema);
const Application = mongoose.model('Application', ApplicationSchema);

// ============ MIDDLEWARE ============

const auth = async (req, res, next) => {
    const token = req.headers.authorization;
    
    if (!token || !token.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    try {
        const actualToken = token.split(' ')[1];
        const decoded = jwt.verify(actualToken, 'jobportal_secret_2024');
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Admin access required' });
    }
};

// ============ API ROUTES ============

// Test Route
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working! 🚀' });
});

// Register User
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, skills } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = new User({
            name,
            email,
            password: hashedPassword,
            skills: skills || ''
        });
        
        await user.save();
        
        res.json({ success: true, message: 'Registration successful! Please login.' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Login User
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password' });
        }
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            'jobportal_secret_2024',
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                skills: user.skills
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get All Jobs with Search
app.get('/api/jobs', async (req, res) => {
    try {
        const { search } = req.query;
        let filter = {};
        
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } },
                { skills_required: { $regex: search, $options: 'i' } }
            ];
        }
        
        const jobs = await Job.find(filter).sort({ createdAt: -1 });
        res.json({ success: true, data: jobs });
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get Single Job
app.get('/api/jobs/:id', async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        res.json({ success: true, data: job });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add Job (Admin Only)
app.post('/api/jobs', auth, admin, async (req, res) => {
    try {
        const { title, company, skills_required, description, location, salary, type } = req.body;
        
        if (!title || !company || !skills_required || !description) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }
        
        const job = new Job({
            title,
            company,
            skills_required,
            description,
            location: location || 'Remote',
            salary: salary || 'Negotiable',
            type: type || 'Full-time',
            createdBy: req.user.id
        });
        
        await job.save();
        
        res.json({ success: true, message: 'Job posted successfully!', data: job });
    } catch (error) {
        console.error('Add job error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete Job (Admin Only)
app.delete('/api/jobs/:id', auth, admin, async (req, res) => {
    try {
        const job = await Job.findByIdAndDelete(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        
        // Delete all applications for this job
        await Application.deleteMany({ job_id: req.params.id });
        
        res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
        console.error('Delete job error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Apply for Job
app.post('/api/apply/:jobId', auth, async (req, res) => {
    try {
        const jobId = req.params.jobId;
        const userId = req.user.id;
        
        // Check if job exists
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        
        // Check if already applied
        const existingApplication = await Application.findOne({ user_id: userId, job_id: jobId });
        if (existingApplication) {
            return res.status(400).json({ success: false, message: 'You have already applied for this job' });
        }
        
        // Create application
        const application = new Application({
            user_id: userId,
            job_id: jobId
        });
        
        await application.save();
        
        res.json({ success: true, message: 'Application submitted successfully!' });
    } catch (error) {
        console.error('Apply error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get My Applications
app.get('/api/applications', auth, async (req, res) => {
    try {
        const applications = await Application.find({ user_id: req.user.id })
            .populate('job_id')
            .sort({ appliedAt: -1 });
        
        res.json({ success: true, data: applications });
    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Check if user applied for a job
app.get('/api/check-application/:jobId', auth, async (req, res) => {
    try {
        const application = await Application.findOne({
            user_id: req.user.id,
            job_id: req.params.jobId
        });
        
        res.json({ success: true, hasApplied: !!application });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============ CREATE DEFAULT ADMIN ============
async function createDefaultAdmin() {
    try {
        const adminExists = await User.findOne({ email: 'admin@jobportal.com' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const admin = new User({
                name: 'Administrator',
                email: 'admin@jobportal.com',
                password: hashedPassword,
                skills: 'Management, Recruitment',
                role: 'admin'
            });
            await admin.save();
            console.log('\n✅ Default admin created!');
            console.log('   Email: admin@jobportal.com');
            console.log('   Password: admin123\n');
        }
    } catch (error) {
        console.error('Error creating admin:', error);
    }
}

// ============ CREATE SAMPLE JOBS ============
async function createSampleJobs() {
    try {
        const jobCount = await Job.countDocuments();
        if (jobCount === 0) {
            const sampleJobs = [
                {
                    title: 'Frontend Developer Intern',
                    company: 'TechCorp India',
                    skills_required: 'React, JavaScript, HTML/CSS, Tailwind',
                    description: 'Looking for passionate frontend developers to work on exciting projects. Duration: 3 months. Stipend: ₹15,000/month.',
                    location: 'Remote',
                    salary: '₹15,000/month',
                    type: 'Internship'
                },
                {
                    title: 'Full Stack Developer',
                    company: 'InnovateLabs',
                    skills_required: 'Node.js, React, MongoDB, Express',
                    description: 'Join our dynamic team to build scalable web applications. Experience with MERN stack required.',
                    location: 'Bangalore',
                    salary: '₹8-12 LPA',
                    type: 'Full-time'
                },
                {
                    title: 'Data Science Intern',
                    company: 'AI Solutions',
                    skills_required: 'Python, Machine Learning, SQL, Pandas',
                    description: 'Work on real-world AI projects. Must have strong analytical skills.',
                    location: 'Hyderabad',
                    salary: '₹20,000/month',
                    type: 'Internship'
                }
            ];
            
            await Job.insertMany(sampleJobs);
            console.log('✅ Sample jobs created!\n');
        }
    } catch (error) {
        console.error('Error creating sample jobs:', error);
    }
}

// ============ START SERVER ============
const PORT = 5500;

createDefaultAdmin();
createSampleJobs();

app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     🚀 JOB PORTAL BACKEND 🚀         ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  Server: http://localhost:${PORT}        ║`);
    console.log(`║  Open: http://localhost:${PORT}         ║`);
    console.log('╠════════════════════════════════════════╣');
    console.log('║  Demo Login:                          ║');
    console.log('║  Email: admin@jobportal.com           ║');
    console.log('║  Password: admin123                   ║');
    console.log('╚════════════════════════════════════════╝\n');
});