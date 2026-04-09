import mongoose from 'mongoose';
import 'dotenv/config';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('Error: MONGODB_URI or MONGO_URI environment variable is required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  
  // Find user by email
  const UserProfile = mongoose.model('UserProfile', new mongoose.Schema({ auth0Id: String, email: String, displayName: String }), 'userprofiles');
  const user = await UserProfile.findOne({ email: 'sterlingmorrison@live.com' });
  console.log('User:', JSON.stringify(user, null, 2));
  
  if (!user) {
    console.log('User not found');
    await mongoose.disconnect();
    return;
  }
  
  // Find memberships
  const Membership = mongoose.model('Membership', new mongoose.Schema({ userId: String, orgId: mongoose.Schema.Types.ObjectId, role: String }), 'memberships');
  const memberships = await Membership.find({ userId: user.auth0Id });
  console.log('Memberships:', JSON.stringify(memberships, null, 2));
  
  // Update org to Pro plan
  const Organization = mongoose.model('Organization', new mongoose.Schema({ name: String, currentPlan: String, subscriptionStatus: String }), 'organizations');
  
  for (const m of memberships) {
    const org = await Organization.findById(m.orgId);
    console.log('Org before:', JSON.stringify(org, null, 2));
    
    if (org) {
      await Organization.updateOne({ _id: m.orgId }, { $set: { currentPlan: 'pro', subscriptionStatus: 'active' } });
      const updated = await Organization.findById(m.orgId);
      console.log('Org after:', JSON.stringify(updated, null, 2));
    }
  }
  
  await mongoose.disconnect();
  console.log('Done!');
}

run().catch(e => console.error(e));