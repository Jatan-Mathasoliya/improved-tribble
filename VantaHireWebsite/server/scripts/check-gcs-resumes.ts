import { Storage } from '@google-cloud/storage';

const GCS_KEY = process.env.GCS_SERVICE_ACCOUNT_KEY;
if (!GCS_KEY) {
  console.error('GCS_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}

const serviceAccountKey = JSON.parse(GCS_KEY);
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID || 'ealmatch-railway',
  credentials: serviceAccountKey,
});

const bucketName = process.env.GCS_BUCKET_NAME || 'vantahire';

const resumePaths = [
  { appId: 365, path: 'resumes/1768301902805_Sandeep_Vichare_CV_122025.pdf' },
  { appId: 717, path: 'resumes/1770089803983_Rohit_Goel_2026__27.pdf' },
  { appId: 718, path: 'resumes/1770091058836_Ankur_Mahato_Resume__Tax_Accountant_Sales_West_Bengal.pdf' },
  { appId: 908, path: 'resumes/1770408414611_59341838-9e67-49a6-903a-b4bd81dc132b.PDF' },
];

async function main() {
  console.log('Checking GCS bucket:', bucketName);
  console.log('---');

  for (const r of resumePaths) {
    try {
      const [exists] = await storage.bucket(bucketName).file(r.path).exists();
      if (exists) {
        const [meta] = await storage.bucket(bucketName).file(r.path).getMetadata();
        console.log(`App ${r.appId}: EXISTS`);
        console.log(`  Path: ${r.path}`);
        console.log(`  Size: ${(Number(meta.size) / 1024).toFixed(1)} KB`);
      } else {
        console.log(`App ${r.appId}: NOT FOUND - ${r.path}`);
      }
    } catch (err: any) {
      console.log(`App ${r.appId}: ERROR - ${err.message}`);
    }
  }
}

main();
