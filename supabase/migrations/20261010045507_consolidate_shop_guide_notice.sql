-- Preserve the original setting as a recovery copy. Never republish on rerun.
DO $migration$
DECLARE
  v_text text;
  v_id bigint;
BEGIN
  LOCK TABLE public.settings IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.settings WHERE key='shop_guide_notice_id') THEN
    RETURN;
  END IF;
  SELECT value INTO v_text FROM public.settings WHERE key='notice_text';
  -- Match JavaScript trim whitespace; do not create a blank public article.
  IF btrim(coalesce(v_text,''), U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> '' THEN
    INSERT INTO public.notices(title,content,category,is_pinned,is_visible,sort_order)
    VALUES ('쇼핑 전 꼭 확인',v_text,'공지',true,true,0)
    RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.settings(key,value)
  VALUES ('shop_guide_notice_id',coalesce(v_id::text,'none'));
END
$migration$;
