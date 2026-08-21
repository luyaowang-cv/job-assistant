UPDATE "Company"
SET "industry" = NULLIF(BTRIM(REPLACE("industry", '婉清学姐冲冲冲的店唯一正版', ''), ' ,、，;；/'), '')
WHERE "industry" LIKE '%婉清学姐冲冲冲的店唯一正版%';

UPDATE "Company"
SET "companyType" = NULLIF(BTRIM(REPLACE("companyType", '婉清学姐冲冲冲的店唯一正版', ''), ' ,、，;；/'), '')
WHERE "companyType" LIKE '%婉清学姐冲冲冲的店唯一正版%';
