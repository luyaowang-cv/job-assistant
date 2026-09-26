ALTER TABLE "ResumeVersion" ADD COLUMN "name" TEXT;

UPDATE "ResumeVersion" AS version
SET "name" = CASE
  WHEN version."type" = 'BASE' THEN resume."name"
  ELSE COALESCE(
    (
      SELECT company."name" || ' · ' || job."title"
      FROM "Application" AS application
      JOIN "Job" AS job ON job."id" = application."jobId"
      JOIN "Company" AS company ON company."id" = job."companyId"
      WHERE application."id" = version."applicationId"
    ),
    resume."name" || '（定制版）'
  )
END
FROM "Resume" AS resume
WHERE resume."id" = version."resumeId";

ALTER TABLE "ResumeVersion" ALTER COLUMN "name" SET NOT NULL;
