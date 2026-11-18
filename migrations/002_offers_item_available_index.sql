-- A lista de itens busca as ofertas disponíveis de cada item (item_id + available). O índice
-- composto atende essa busca e também a FK de item_id, então o índice simples sai.
ALTER TABLE offers ADD INDEX idx_offers_item_available (item_id, available);
ALTER TABLE offers DROP INDEX idx_offers_item_id;
