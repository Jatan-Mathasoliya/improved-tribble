/**
 * Seed default ATS data: Pipeline stages and email templates
 * Run once to populate default stages and email templates
 */

import { db } from './db';
import { pipelineStages, emailTemplates, consultants } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { seedDefaultWhatsAppTemplates } from './seedWhatsAppTemplates';

export async function seedDefaultPipelineStages() {
  console.log('🌱 Seeding default pipeline stages...');

  const defaultStages = [
    { name: 'Applied', order: 1, color: '#6b7280', isDefault: true }, // gray
    { name: 'Screening', order: 2, color: '#3b82f6', isDefault: true }, // blue
    { name: 'Interview Scheduled', order: 3, color: '#f59e0b', isDefault: true }, // amber
    { name: 'Offer Extended', order: 4, color: '#10b981', isDefault: true }, // green
    { name: 'Hired', order: 5, color: '#059669', isDefault: true }, // emerald
    { name: 'Rejected', order: 6, color: '#ef4444', isDefault: true }, // red
  ];

  for (const stage of defaultStages) {
    // Check if stage already exists
    const existing = await db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.name, stage.name)
    });

    if (!existing) {
      await db.insert(pipelineStages).values(stage);
      console.log(`  ✓ Created stage: ${stage.name}`);
    } else {
      console.log(`  ⊘ Stage already exists: ${stage.name}`);
    }
  }

  console.log('✅ Pipeline stages seeded\n');
}

export async function seedDefaultEmailTemplates() {
  console.log('🌱 Seeding default email templates...');

  const defaultTemplates = [
    {
      name: 'Interview Invitation',
      subject: 'Interview Invitation - {{job_title}} at VantaHire',
      body: `Dear {{candidate_name}},

Thank you for applying for the {{job_title}} position at VantaHire!

We're impressed with your application and would like to invite you for an interview.

📅 Date: {{interview_date}}
🕐 Time: {{interview_time}}
📍 Location: {{interview_location}}

Please confirm your availability by replying to this email. If you have any questions or need to reschedule, don't hesitate to reach out.

We look forward to speaking with you!

Best regards,
{{recruiter_name}}
VantaHire Recruitment Team`,
      templateType: 'interview_invite',
      isDefault: true,
    },
    {
      name: 'Application Received',
      subject: 'Application Received - {{job_title}}',
      body: `Dear {{candidate_name}},

Thank you for your interest in the {{job_title}} position at VantaHire!

We've received your application and our team is currently reviewing all submissions. We'll be in touch soon regarding the next steps in our hiring process.

If you have any questions in the meantime, please don't hesitate to contact us.

Best regards,
{{recruiter_name}}
VantaHire Recruitment Team`,
      templateType: 'application_received',
      isDefault: true,
    },
    {
      name: 'Application Status Update',
      subject: 'Update on Your Application - {{job_title}}',
      body: `Dear {{candidate_name}},

We wanted to update you on your application for the {{job_title}} position.

Your application status has been updated to: {{new_status}}

We appreciate your patience throughout this process. If you have any questions, please feel free to reach out.

Best regards,
{{recruiter_name}}
VantaHire Recruitment Team`,
      templateType: 'status_update',
      isDefault: true,
    },
    {
      name: 'Offer Extended',
      subject: 'Job Offer - {{job_title}} at VantaHire',
      body: `Dear {{candidate_name}},

Congratulations! We're pleased to extend an offer for the {{job_title}} position at VantaHire.

We believe you'll be a great addition to our team. Attached you'll find the formal offer letter with details about compensation, benefits, and start date.

Please review the offer and let us know if you have any questions. We're excited about the possibility of you joining our team!

Best regards,
{{recruiter_name}}
VantaHire Recruitment Team`,
      templateType: 'offer_extended',
      isDefault: true,
    },
    {
      name: 'Application Not Selected',
      subject: 'Update on Your Application - {{job_title}}',
      body: `Dear {{candidate_name}},

Thank you for your interest in the {{job_title}} position at VantaHire and for taking the time to apply.

After careful consideration, we've decided to move forward with other candidates whose experience more closely aligns with our current needs.

We were impressed by your background and encourage you to apply for future opportunities that match your skills and experience. We'll keep your resume on file for consideration.

We wish you all the best in your job search.

Best regards,
{{recruiter_name}}
VantaHire Recruitment Team`,
      templateType: 'rejection',
      isDefault: true,
    },
    {
      name: 'Co-Recruiter Invitation',
      subject: "You're invited to collaborate on \"{{job_title}}\"",
      body: `{{greeting}}

{{inviter_name}} has invited you to collaborate as a co-recruiter on the job posting:

📋 {{job_title}}

As a co-recruiter, you'll have full access to:
• View and manage all applications for this job
• Update candidate stages and statuses
• Send forms and emails to candidates
• Access job analytics and reports

Click the link below to accept your invitation:
{{accept_url}}

This invitation expires in {{expiry_days}} days.

If you didn't expect this invitation, you can safely ignore this email.

Best regards,
VantaHire Team`,
      templateType: 'co_recruiter_invitation',
      isDefault: true,
    },
    {
      name: 'Co-Recruiter Added Notification',
      subject: "You've been added as a co-recruiter on \"{{job_title}}\"",
      body: `{{greeting}}

{{inviter_name}} has added you as a co-recruiter on the job posting:

📋 {{job_title}}

You now have full access to manage applications and collaborate on this hiring process.

Login to view the job dashboard:
{{dashboard_url}}

Best regards,
VantaHire Team`,
      templateType: 'co_recruiter_added',
      isDefault: true,
    },
  ];

  for (const template of defaultTemplates) {
    // Check if template already exists
    const existing = await db.query.emailTemplates.findFirst({
      where: eq(emailTemplates.name, template.name)
    });

    if (!existing) {
      await db.insert(emailTemplates).values(template);
      console.log(`  ✓ Created template: ${template.name}`);
    } else {
      console.log(`  ⊘ Template already exists: ${template.name}`);
    }
  }

  console.log('✅ Email templates seeded\n');
}

export async function seedConsultants() {
  console.log('🌱 Seeding consultant profiles...');

  const defaultConsultants = [
    {
      name: 'Smita Shirke',
      email: 'jadhav.smita03@gmail.com',
      experience: '5 Years',
      linkedinUrl: 'https://www.linkedin.com/in/smita-jadhav-shirke-3b493a30/',
      domains: 'Test & Measurement, Embedded, Automotive, Oil & Gas, Software Technology, Telecom, Cloud Computing, Industrial Measurement, Digital Media, Fintech',
      description: 'Worked with Finland based Industrial Measurement company, to set up their NTT in Mumbai',
      photoUrl: 'https://drive.google.com/uc?id=1zaNRNvlVCx9cEEbVFWNcTJT6F7-dWsXh',
      isActive: true,
    },
    {
      name: 'Hina Udernani',
      email: 'hina.mahesh@gmail.com',
      experience: '12 Years',
      linkedinUrl: 'https://www.linkedin.com/in/hina-udernani-2a68a0b',
      domains: 'HR Management, Recruitment Specialist, Interview Coordination, Background Checks, Onboarding, Candidate Management, Employee Records, Talent Acquisition, Retention, Succession Planning',
      description: 'Accomplished HR professional with over 12 years of experience in human resources management, specializing in recruitment and aligning HR function with business strategies. Adept at designing and executing talent acquisition, retention, and succession planning. As a recruiting specialist - interview coordination, doing background checks, onboarding new hires, ensuring candidate management stays top notch along with maintaining employee records. As a recruiter - determining staffing needs, acting as a communication channel between candidates and companies along with process improvements.',
      photoUrl: 'https://drive.google.com/uc?id=17vQ2GrQisb_1kt3-xsQhrrpntPvubcrK',
      isActive: true,
    },
    {
      name: 'Bhaskar Boroo',
      email: 'bhaskarbaroo@gmail.com',
      experience: '12 Years',
      linkedinUrl: 'https://www.linkedin.com/in/bhaskar-boroo-3b39317b',
      domains: 'Telecom, Fintech, Semiconductor, Storage',
      description: 'My journey with Vantahire has been truly fulfilling. Joining as a freelance recruiter in June, I\'ve had the opportunity to work with diverse clients, manage varied hiring mandates, and refine my end-to-end recruitment skills. The supportive environment, transparent communication, and collaborative culture have made the experience both enjoyable and professionally enriching.',
      photoUrl: 'https://drive.google.com/uc?id=1xs2Kqx1s_ySsAK17DbGE5LOPwrJ1SFje',
      isActive: true,
    },
    {
      name: 'Harshita Bhargava',
      email: 'Harshitabhargava02@gmail.com',
      experience: '4.5 Years',
      linkedinUrl: 'https://www.linkedin.com/in/harshitabhargava',
      domains: 'IT and Non IT Hiring, Talent Acquisition, End to End Recruitment, Stakeholder Management, HR Operations, Headhunting, Sourcing, Data Management',
      description: 'Experienced recruitment specialist with expertise in full-cycle recruitment across IT and non-IT sectors.',
      photoUrl: 'https://drive.google.com/uc?id=178icrkRIFbxCqSKgf3KVhceojdQWwU6c',
      isActive: true,
    },
    {
      name: 'Deepika M',
      email: 'deepikalikitha04@gmail.com',
      experience: '2.5 Years',
      linkedinUrl: 'https://www.linkedin.com/in/deepika-m-3355a7171',
      domains: 'IT Recruitment',
      description: 'IT Recruiter focused on market niche skills',
      photoUrl: 'https://drive.google.com/uc?id=1Qu1K_R0tFKNIhq3s88n8-rEtWbyN_qRy',
      isActive: true,
    },
  ];

  for (const consultant of defaultConsultants) {
    // Check if consultant already exists
    const existing = await db.query.consultants.findFirst({
      where: eq(consultants.email, consultant.email)
    });

    if (!existing) {
      await db.insert(consultants).values(consultant);
      console.log(`  ✓ Created consultant: ${consultant.name}`);
    } else {
      console.log(`  ⊘ Consultant already exists: ${consultant.name}`);
    }
  }

  console.log('✅ Consultant profiles seeded\n');
}

export async function seedAllATSDefaults() {
  try {
    await seedDefaultPipelineStages();
    await seedDefaultEmailTemplates();
    await seedDefaultWhatsAppTemplates();
    await seedConsultants();
    console.log('🎉 All ATS default data seeded successfully!');
  } catch (error: any) {
    console.error('❌ Error seeding ATS defaults:', error);
    throw error;
  }
}

// Run if called directly (only in non-bundled environment)
if (import.meta.url === `file://${process.argv[1]}` && !process.env.NODE_ENV) {
  seedAllATSDefaults()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
