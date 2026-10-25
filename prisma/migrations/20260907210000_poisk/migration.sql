-- Полнотекстовый поиск по фрагментам.
--
-- Конфигурация russian: материал двуязычный, но кириллицы в нём кратно больше, а латинские
-- обозначения (MC, TC, Q) стеммер не трогает и оставляет как есть.
--
-- Триггер, а не генерируемая колонка: Prisma видит колонку как Unsupported и на генерируемой
-- начала бы сообщать о расхождении при каждой миграции.

CREATE OR REPLACE FUNCTION fragment_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('russian', coalesce(NEW.text, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fragment_tsv_trigger ON "Fragment";

CREATE TRIGGER fragment_tsv_trigger
  BEFORE INSERT OR UPDATE OF text ON "Fragment"
  FOR EACH ROW EXECUTE FUNCTION fragment_tsv_update();

CREATE INDEX IF NOT EXISTS "Fragment_tsv_idx" ON "Fragment" USING GIN (tsv);

-- Приближённого индекса по векторам на старте нет намеренно. Фильтр по курсу оставляет
-- тысячи фрагментов, и точный перебор по ним занимает единицы миллисекунд, а HNSW добавил бы
-- потерю полноты и время на перестроение.
