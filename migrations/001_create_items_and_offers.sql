-- items.chosen_offer_id aponta para offers e offers.item_id aponta para items: como uma tabela
-- depende da outra, a FK items -> offers é criada no fim, depois que offers existe.

CREATE TABLE items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'researching',
  chosen_offer_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_status (status),
  KEY idx_items_chosen_offer_id (chosen_offer_id),
  CONSTRAINT chk_items_status CHECK (status IN ('researching', 'bought', 'gave_up'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE offers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id INT UNSIGNED NOT NULL,
  seller VARCHAR(120) NOT NULL,
  url VARCHAR(2048) NULL,
  price_cents INT NULL,
  `condition` VARCHAR(20) NULL,
  installments TINYINT UNSIGNED NULL,
  installment_cents INT NULL,
  interest_free TINYINT(1) NULL,
  shipping_cents INT NULL,
  location VARCHAR(120) NULL,
  notes TEXT NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_offers_item_id (item_id),
  CONSTRAINT fk_offers_item FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
  CONSTRAINT chk_offers_condition CHECK (`condition` IN ('new', 'used', 'refurbished')),
  CONSTRAINT chk_offers_price CHECK (price_cents >= 0),
  CONSTRAINT chk_offers_installments CHECK (installments BETWEEN 1 AND 48),
  CONSTRAINT chk_offers_installment_cents CHECK (installment_cents >= 0),
  CONSTRAINT chk_offers_shipping CHECK (shipping_cents >= 0),
  CONSTRAINT chk_offers_interest_free CHECK (interest_free IN (0, 1)),
  CONSTRAINT chk_offers_available CHECK (available IN (0, 1))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE items
  ADD CONSTRAINT fk_items_chosen_offer
  FOREIGN KEY (chosen_offer_id) REFERENCES offers (id) ON DELETE SET NULL;
