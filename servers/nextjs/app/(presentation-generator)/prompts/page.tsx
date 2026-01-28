import React from "react";
import { Metadata } from "next";

import Header from "@/app/(presentation-generator)/dashboard/components/Header";
import Wrapper from "@/components/Wrapper";
import { TeacherTemplatesSettings } from "@/app/(presentation-generator)/settings/components/TeacherTemplatesSettings";

export const metadata: Metadata = {
  title: "Prompts | Presenton",
  description: "Teacher prompt templates and class/subject templates",
};

const page = () => {
  return (
    <div className="relative">
      <Header />
      <Wrapper className="py-8">
        <div className="flex flex-col gap-2 pb-6">
          <h1 className="text-3xl font-semibold font-instrument_sans">
            Шаблоны промптов
          </h1>
          <p className="text-sm text-gray-500">
            Настройка личных шаблонов и шаблонов по классу/предмету.
          </p>
        </div>
        <TeacherTemplatesSettings />
      </Wrapper>
    </div>
  );
};

export default page;
