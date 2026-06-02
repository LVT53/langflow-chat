ALTER TABLE `inference_providers`
ADD COLUMN `capabilities_json` text NOT NULL DEFAULT '{}';
