ALTER TABLE "Company" ADD COLUMN "description" TEXT;

ALTER TABLE "Job"
  ADD COLUMN "referralCode" TEXT,
  ADD COLUMN "applicationNotes" TEXT;
