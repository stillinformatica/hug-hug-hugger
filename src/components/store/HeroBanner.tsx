import bannerImg from "@/assets/banner.png";

export const HeroBanner = () => {
  return (
    <section className="w-full max-w-7xl mx-auto px-4 mt-4">
      <img
        src={bannerImg}
        alt="Still Informática - Next-Gen Gaming Power"
        className="w-full h-auto object-cover rounded-2xl max-h-[320px]"
      />
    </section>
  );
};
