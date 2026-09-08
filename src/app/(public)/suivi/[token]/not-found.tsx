export default function FollowUpNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-[#eef1f4] px-4 py-10">
      <div className="space-y-3 rounded-[24px] bg-white p-7 shadow-lg">
        <h1 className="text-[22px] leading-7 font-bold text-[#111827]">Ce lien n&apos;est plus valide</h1>
        <p className="text-[15.5px] leading-6 text-[#374151]">
          Il a peut-être déjà été utilisé, ou il est incomplet. Votre pharmacie reste joignable directement si vous avez une question.
        </p>
      </div>
    </main>
  );
}
