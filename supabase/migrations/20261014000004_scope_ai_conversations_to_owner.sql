-- Found during P1 matrix testing: ai_conversations/ai_messages SELECT
-- policies are company-wide (company_id = get_user_company_id(auth.uid()))
-- with no user_id restriction, meaning any employee could read any other
-- employee's AI conversation history. Confirmed both tables are currently
-- dead schema -- zero references in the frontend and zero references in
-- any edge function (grepped both) -- so there is no live exposure today.
-- Tightening now as cheap, correct hygiene before anything is ever wired
-- up to populate them, rather than leaving an overly-broad policy for a
-- future feature to inherit unreviewed.

DO $privacy$
BEGIN
IF to_regclass('public.ai_conversations') IS NOT NULL THEN
DROP POLICY IF EXISTS "Members view own company conversations" ON public.ai_conversations;
CREATE POLICY "Users view their own conversations" ON public.ai_conversations
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND user_id = auth.uid());

END IF;
IF to_regclass('public.ai_messages') IS NOT NULL THEN

DROP POLICY IF EXISTS "Members view own company messages" ON public.ai_messages;
CREATE POLICY "Users view their own conversation messages" ON public.ai_messages
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND user_id = auth.uid());
END IF;
END;
$privacy$;
