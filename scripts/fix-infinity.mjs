import { MongoClient } from "mongodb";

const MONGO_URL = "mongodb+srv://sterling:9uopyVoqYB@cluster0.qllrt.mongodb.net/lamdis_prod";

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db("lamdis");

  // Fix all robot models: replace null lower/upper with large finite bounds
  const models = await db.collection("embodied_robot_models").find({}).toArray();
  for (const model of models) {
    console.log(`Model: ${model.name} ${model.version}`);
    if (model.physics?.joint_limits) {
      const newLimits = model.physics.joint_limits.map(jl => {
        console.log(`  Joint: ${jl.name}, lower=${jl.lower} (${typeof jl.lower}), upper=${jl.upper} (${typeof jl.upper})`);
        return {
          ...jl,
          lower: (jl.lower === null || jl.lower === undefined || !Number.isFinite(jl.lower)) ? -1000000.0 : jl.lower,
          upper: (jl.upper === null || jl.upper === undefined || !Number.isFinite(jl.upper)) ? 1000000.0 : jl.upper,
        };
      });
      console.log("  New limits:", JSON.stringify(newLimits));
      await db.collection("embodied_robot_models").updateOne(
        { _id: model._id },
        { $set: { "physics.joint_limits": newLimits } }
      );
      console.log("  Updated!");
    }
  }

  // Verify
  const check = await db.collection("embodied_robot_models").findOne({});
  console.log("\nVerified:", JSON.stringify(check.physics.joint_limits, null, 2));

  await client.close();
}

main().catch(console.error);
