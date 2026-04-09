import mongoose from 'mongoose';
import { config } from 'dotenv';
config();
await mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/lamdis');
const doc = await mongoose.connection.db.collection('runs').findOne({ _id: new mongoose.Types.ObjectId('6983f33183657a545638edd8') });
console.log(JSON.stringify(doc, null, 2));
process.exit(0);