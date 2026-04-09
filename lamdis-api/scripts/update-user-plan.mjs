import mongoose from 'mongoose';
import 'dotenv/config';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('Error: MONGODB_URI or MONGO_URI environment variable is required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  
  const Organization = mongoose.model('Organization', new mongoose.Schema({ 
    name: String, 
    currentPlan: String, 
    subscriptionStatus: String,
    assurancePlan: String,
    assuranceSubscriptionStatus: String 
  }), 'organizations');
  
  // Update "My Org" (id: 68b4f0bc77b40dec57bcfc0d) to mid-tier plans
  // Runs: pro, Assurance: assurance_business
  const orgId = '68b4f0bc77b40dec57bcfc0d';
  
  const orgBefore = await Organization.findById(orgId);
  console.log('Org before:', JSON.stringify({ 
    id: orgBefore._id, 
    name: orgBefore.name, 
    runsPlan: orgBefore.currentPlan, 
    runsStatus: orgBefore.subscriptionStatus,
    assurancePlan: orgBefore.assurancePlan,
    assuranceStatus: orgBefore.assuranceSubscriptionStatus 
  }, null, 2));
  
  await Organization.updateOne({ _id: orgId }, { 
    $set: { 
      // Set Runs plan to Pro (mid-tier)
      currentPlan: 'pro', 
      subscriptionStatus: 'active',
      // Set Assurance plan to Business (mid-tier)
      assurancePlan: 'assurance_business',
      assuranceSubscriptionStatus: 'active'
    } 
  });
  
  const orgAfter = await Organization.findById(orgId);
  console.log('Org after:', JSON.stringify({ 
    id: orgAfter._id, 
    name: orgAfter.name, 
    runsPlan: orgAfter.currentPlan, 
    runsStatus: orgAfter.subscriptionStatus,
    assurancePlan: orgAfter.assurancePlan,
    assuranceStatus: orgAfter.assuranceSubscriptionStatus 
  }, null, 2));
  
  await mongoose.disconnect();
  console.log('\nDone! Updated My Org to mid-tier plans:');
  console.log('- Runs: Pro ($299/mo)');
  console.log('- Assurance: Business ($1,499/mo)');
}

run().catch(e => console.error(e));