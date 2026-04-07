import bannerImg from "@/assets/banner.png";

export const HeroBanner = () => {
  return (
    <section className="w-full max-w-7xl mx-auto px-4 mt-4">
      <div className="w-full rounded-2xl overflow-hidden">
        <img
          src={bannerImg}
          alt="Still Informática"
          width={1920}
          height={512}
          className="w-full h-auto object-contain"
        />
      </div>
    </section>
  );
};
